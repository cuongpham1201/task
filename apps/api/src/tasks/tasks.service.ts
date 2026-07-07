import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PolicyService } from '../common/policy.service'
import { VisibilityService, type Me } from '../common/visibility.service'
import { NotificationsService } from '../notifications/notifications.service'
import type {
  AssigneeDto, CreateTaskDto, DueDateDto, PriorityDto, ProgressDto, ReviewDto, UpdateTaskDto,
} from './task.dto'

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly vis: VisibilityService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Đọc (đã scope theo quyền) — shape khớp frontend hiện tại ──
  async findAll(me: Me) {
    const where = { AND: [{ archived: false }, await this.vis.taskWhere(me)] }
    const tasks = await this.prisma.task.findMany({
      where,
      include: { collaborators: { select: { userId: true } }, workspace: true },
      orderBy: { createdAt: 'desc' },
    })
    return tasks.map((t) => this.serialize(t, t.collaborators.map((c) => c.userId)))
  }

  // Map workspace → shape FE cũ (scope/departmentId/channelId) + giữ workspaceId
  private serialize(task: any, collaboratorIds: string[]) {
    const { collaborators, workspace, ...rest } = task
    let scope = 'personal'
    let departmentId: string | null = null
    let channelId: string | null = null
    if (workspace?.type === 'org_unit') { scope = 'department'; departmentId = workspace.orgUnitId }
    else if (workspace?.type === 'project') { scope = 'channel'; channelId = workspace.id }
    return { ...rest, scope, departmentId, channelId, collaboratorIds }
  }

  private async load(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id }, include: { workspace: true } })
    if (!task || task.archived) throw new NotFoundException('Không tìm thấy công việc')
    return task
  }

  private async withCollaborators(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { collaborators: { select: { userId: true } }, workspace: true },
    })
    return this.serialize(task, task!.collaborators.map((c) => c.userId))
  }

  // ── Tạo ──
  async create(me: Me, dto: CreateTaskDto) {
    const workspaceId = dto.workspaceId ?? null
    this.policy.assert(await this.policy.canCreate(me, workspaceId), 'Không có quyền tạo việc trong workspace này')

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description ?? '',
          workspaceId,
          section: (dto.section as any) ?? null,
          creatorId: me.id,
          assigneeId: dto.assigneeId ?? me.id,
          priority: (dto.priority as any) ?? 'normal',
          completionMode: (dto.completionMode as any) ?? 'self',
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        },
      })
      if (dto.collaboratorIds?.length) {
        await tx.taskCollaborator.createMany({
          data: dto.collaboratorIds.map((userId) => ({ taskId: created.id, userId })),
          skipDuplicates: true,
        })
      }
      if (dto.subtasks?.length) {
        await tx.subtask.createMany({
          data: dto.subtasks.map((title, i) => ({ taskId: created.id, title, assigneeId: created.assigneeId, sortOrder: i })),
        })
      }
      await this.notifications.emit(tx, { task: created, actorId: me.id, action: 'create', notifyType: 'task_assigned' })
      return created
    })
    const serialized = await this.withCollaborators(task.id)
    const subtasks = await this.prisma.subtask.findMany({ where: { taskId: task.id }, orderBy: { sortOrder: 'asc' } })
    return { ...serialized, subtasks }
  }

  // ── Trạng thái ──
  async setStatus(me: Me, id: string, status: string) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canUpdateStatus(me, task, task.workspace), 'Không có quyền đổi trạng thái')
    if (task.status === 'submitted' && !(await this.policy.canReview(me, task, task.workspace))) {
      throw new BadRequestException('Việc đang chờ nghiệm thu — chờ kết quả Đạt/Trả lại.')
    }
    if (status === 'done' && task.completionMode === 'review_required' && !(await this.policy.canReview(me, task, task.workspace))) {
      throw new BadRequestException('Việc này cần nghiệm thu — hãy "Nộp nghiệm thu" thay vì tự đóng.')
    }
    const isDone = status === 'done'
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: { status: status as any, completedAt: isDone ? new Date() : null, completedById: isDone ? me.id : null, progress: isDone ? 100 : task.progress },
      })
      await this.notifications.emit(tx, {
        task, actorId: me.id, action: isDone ? 'complete' : 'status',
        metadata: isDone ? {} : { from: task.status, to: status }, notifyType: null,
      })
    })
    return this.withCollaborators(id)
  }

  async submit(me: Me, id: string) {
    const task = await this.load(id)
    this.policy.assert(task.assigneeId === me.id || (await this.policy.canManage(me, task, task.workspace)), 'Chỉ người được giao mới nộp nghiệm thu')
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { status: 'submitted' as any } })
      await this.notifications.emit(tx, { task, actorId: me.id, action: 'review', metadata: { to: 'submitted' }, notifyType: 'task_assigned', extraRecipients: [task.creatorId] })
    })
    return this.withCollaborators(id)
  }

  async review(me: Me, id: string, dto: ReviewDto) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canReview(me, task, task.workspace), 'Không có quyền nghiệm thu công việc này')
    const passed = dto.decision === 'passed'
    await this.prisma.$transaction(async (tx) => {
      await tx.taskReview.upsert({
        where: { taskId: id },
        create: { taskId: id, reviewerId: me.id, decision: dto.decision as any, note: dto.note ?? '' },
        update: { reviewerId: me.id, decision: dto.decision as any, note: dto.note ?? '', reviewedAt: new Date() },
      })
      await tx.task.update({
        where: { id },
        data: passed
          ? { status: 'done' as any, completedAt: new Date(), completedById: task.assigneeId, progress: 100 }
          : { status: 'returned' as any, completedAt: null, completedById: null },
      })
      if (passed) {
        const assignee = await tx.user.findUnique({ where: { id: task.assigneeId }, select: { entraId: true } })
        const reviewer = await tx.user.findUnique({ where: { id: me.id }, select: { entraId: true } })
        if (assignee?.entraId) {
          await tx.taskKpiResult.upsert({
            where: { idempotencyKey: `taskhub:${id}:review` },
            create: {
              taskId: id, entraObjectId: assignee.entraId, dueDate: task.dueDate, completedAt: new Date(),
              acceptedAt: new Date(), reviewerEntraId: reviewer?.entraId ?? null,
              idempotencyKey: `taskhub:${id}:review`, pushStatus: 'pending' as any,
            },
            update: { acceptedAt: new Date(), pushStatus: 'pending' as any },
          })
        }
      }
      await this.notifications.emit(tx, { task, actorId: me.id, action: 'review', metadata: { decision: dto.decision }, notifyType: passed ? 'task_accepted' : 'task_returned' })
    })
    return this.withCollaborators(id)
  }

  async setAssignee(me: Me, id: string, dto: AssigneeDto) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canManage(me, task, task.workspace), 'Không có quyền đổi người phụ trách')
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { assigneeId: dto.assigneeId } })
      await this.notifications.emit(tx, { task: { ...task, assigneeId: dto.assigneeId }, actorId: me.id, action: 'assign', metadata: { from: task.assigneeId, to: dto.assigneeId }, notifyType: 'task_assigned', extraRecipients: [dto.assigneeId] })
    })
    return this.withCollaborators(id)
  }

  async setDueDate(me: Me, id: string, dto: DueDateDto) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canManage(me, task, task.workspace), 'Không có quyền đổi deadline')
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } })
      await this.notifications.emit(tx, { task, actorId: me.id, action: 'due', metadata: { to: dto.dueDate ?? null }, notifyType: null })
    })
    return this.withCollaborators(id)
  }

  async setPriority(me: Me, id: string, dto: PriorityDto) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canManage(me, task, task.workspace), 'Không có quyền đổi ưu tiên')
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { priority: dto.priority as any } })
      await this.notifications.emit(tx, { task, actorId: me.id, action: 'priority', metadata: { from: task.priority, to: dto.priority }, notifyType: null })
    })
    return this.withCollaborators(id)
  }

  async setProgress(me: Me, id: string, dto: ProgressDto) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canUpdateStatus(me, task, task.workspace), 'Không có quyền cập nhật tiến độ')
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { progress: dto.progress } })
      await this.notifications.emit(tx, { task, actorId: me.id, action: 'progress', metadata: { to: dto.progress }, notifyType: null })
    })
    return this.withCollaborators(id)
  }

  async updateFields(me: Me, id: string, dto: UpdateTaskDto) {
    const task = await this.load(id)
    const onlyDescription = Object.keys(dto).every((k) => k === 'description')
    const allowed = onlyDescription
      ? await this.policy.canUpdateStatus(me, task, task.workspace)
      : await this.policy.canManage(me, task, task.workspace)
    this.policy.assert(allowed, 'Không có quyền sửa công việc')
    const fields = Object.keys(dto)
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.section !== undefined ? { section: dto.section as any } : {}),
          ...(dto.startDate !== undefined ? { startDate: dto.startDate ? new Date(dto.startDate) : null } : {}),
        },
      })
      await this.notifications.emit(tx, { task, actorId: me.id, action: 'edit', metadata: { fields }, notifyType: null })
    })
    return this.withCollaborators(id)
  }

  async archive(me: Me, id: string) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canManage(me, task, task.workspace), 'Không có quyền xóa công việc')
    await this.prisma.task.update({ where: { id }, data: { archived: true } })
    return { archived: true }
  }
}
