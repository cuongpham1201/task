import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PolicyService } from '../common/policy.service'
import { NotificationsService } from '../notifications/notifications.service'
import type {
  AssigneeDto, CreateTaskDto, DueDateDto, PriorityDto, ProgressDto, ReviewDto, UpdateTaskDto,
} from './task.dto'

type Me = { id: string; role: string; departmentId: string | null }

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Đọc (shape "channel" khớp frontend hiện tại) ──
  async findAll() {
    const tasks = await this.prisma.task.findMany({
      where: { archived: false },
      include: { collaborators: { select: { userId: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return tasks.map((t) => this.serialize(t, t.collaborators.map((c) => c.userId)))
  }

  private serialize(task: any, collaboratorIds: string[]) {
    const { collaborators, projectId, scope, ...rest } = task
    return {
      ...rest,
      scope: scope === 'project' ? 'channel' : scope,
      channelId: projectId,
      collaboratorIds,
    }
  }

  private async loadOr404(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } })
    if (!task || task.archived) throw new NotFoundException('Không tìm thấy công việc')
    return task
  }

  private async withCollaborators(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { collaborators: { select: { userId: true } } },
    })
    return this.serialize(task, task!.collaborators.map((c) => c.userId))
  }

  // ── Tạo ──
  async create(me: Me, dto: CreateTaskDto) {
    const departmentId = dto.scope === 'department' ? dto.departmentId ?? null : null
    const projectId = dto.scope === 'project' ? dto.projectId ?? null : null
    this.policy.assert(this.policy.canCreate(me, dto.scope, departmentId), 'Không có quyền tạo việc loại này')
    if (dto.scope === 'department' && !departmentId) throw new BadRequestException('Thiếu departmentId')
    if (dto.scope === 'project' && !projectId) throw new BadRequestException('Thiếu projectId')

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description ?? '',
          scope: dto.scope as any,
          departmentId,
          projectId,
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
          data: dto.subtasks.map((title, i) => ({
            taskId: created.id, title, assigneeId: created.assigneeId, sortOrder: i,
          })),
        })
      }
      await this.notifications.emit(tx, {
        task: created,
        actorId: me.id,
        action: 'create',
        notifyType: created.assigneeId !== me.id ? 'task_assigned' : null,
      })
      return created
    })
    // Kèm subtasks vừa tạo để frontend hiển thị ngay (không phải refresh)
    const serialized = await this.withCollaborators(task.id)
    const subtasks = await this.prisma.subtask.findMany({
      where: { taskId: task.id },
      orderBy: { sortOrder: 'asc' },
    })
    return { ...serialized, subtasks }
  }

  // ── Đổi trạng thái (todo/doing/waiting/paused/done) ──
  async setStatus(me: Me, id: string, status: string) {
    const task = await this.loadOr404(id)
    this.policy.assert(this.policy.canUpdateStatus(me, task), 'Không có quyền đổi trạng thái')
    if (status === 'done' && task.completionMode === 'review_required' && !this.policy.canReview(me, task)) {
      throw new BadRequestException('Việc này cần nghiệm thu — hãy "Nộp nghiệm thu" thay vì tự đóng.')
    }
    const isDone = status === 'done'
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: {
          status: status as any,
          completedAt: isDone ? new Date() : null,
          completedById: isDone ? me.id : null,
          progress: isDone ? 100 : task.progress,
        },
      })
      await this.notifications.emit(tx, {
        task, actorId: me.id,
        action: isDone ? 'complete' : 'status',
        metadata: isDone ? {} : { from: task.status, to: status },
        notifyType: null,
      })
    })
    return this.withCollaborators(id)
  }

  // ── Nộp nghiệm thu (assignee) ──
  async submit(me: Me, id: string) {
    const task = await this.loadOr404(id)
    this.policy.assert(task.assigneeId === me.id || this.policy.canManage(me, task), 'Chỉ người được giao mới nộp nghiệm thu')
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { status: 'submitted' as any } })
      await this.notifications.emit(tx, {
        task, actorId: me.id, action: 'review',
        metadata: { to: 'submitted' },
        notifyType: 'task_assigned', // báo cho creator/collaborators biết chờ nghiệm thu
        extraRecipients: [task.creatorId],
      })
    })
    return this.withCollaborators(id)
  }

  // ── Nghiệm thu: Đạt/Trả lại (reviewer) ──
  async review(me: Me, id: string, dto: ReviewDto) {
    const task = await this.loadOr404(id)
    this.policy.assert(this.policy.canReview(me, task), 'Không có quyền nghiệm thu công việc này')
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
      // Feed KPI cho HRM (chỉ khi Đạt) — best-effort, cần entraId của người thực hiện.
      if (passed) {
        const assignee = await tx.user.findUnique({ where: { id: task.assigneeId }, select: { entraId: true } })
        const reviewer = await tx.user.findUnique({ where: { id: me.id }, select: { entraId: true } })
        if (assignee?.entraId) {
          await tx.taskKpiResult.upsert({
            where: { idempotencyKey: `taskhub:${id}:review` },
            create: {
              taskId: id, entraObjectId: assignee.entraId,
              dueDate: task.dueDate, completedAt: new Date(), acceptedAt: new Date(),
              reviewerEntraId: reviewer?.entraId ?? null,
              idempotencyKey: `taskhub:${id}:review`, pushStatus: 'pending' as any,
            },
            update: { acceptedAt: new Date(), pushStatus: 'pending' as any },
          })
        }
      }
      await this.notifications.emit(tx, {
        task, actorId: me.id, action: 'review',
        metadata: { decision: dto.decision },
        notifyType: passed ? 'task_accepted' : 'task_returned',
      })
    })
    return this.withCollaborators(id)
  }

  // ── Đổi người phụ trách ──
  async setAssignee(me: Me, id: string, dto: AssigneeDto) {
    const task = await this.loadOr404(id)
    this.policy.assert(this.policy.canManage(me, task), 'Không có quyền đổi người phụ trách')
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { assigneeId: dto.assigneeId } })
      await this.notifications.emit(tx, {
        task: { ...task, assigneeId: dto.assigneeId },
        actorId: me.id, action: 'assign',
        metadata: { from: task.assigneeId, to: dto.assigneeId },
        notifyType: 'task_assigned',
        extraRecipients: [dto.assigneeId],
      })
    })
    return this.withCollaborators(id)
  }

  async setDueDate(me: Me, id: string, dto: DueDateDto) {
    const task = await this.loadOr404(id)
    this.policy.assert(this.policy.canManage(me, task), 'Không có quyền đổi deadline')
    const due = dto.dueDate ? new Date(dto.dueDate) : null
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { dueDate: due } })
      await this.notifications.emit(tx, {
        task, actorId: me.id, action: 'due',
        metadata: { to: dto.dueDate ?? null }, notifyType: null,
      })
    })
    return this.withCollaborators(id)
  }

  async setPriority(me: Me, id: string, dto: PriorityDto) {
    const task = await this.loadOr404(id)
    this.policy.assert(this.policy.canManage(me, task), 'Không có quyền đổi ưu tiên')
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { priority: dto.priority as any } })
      await this.notifications.emit(tx, {
        task, actorId: me.id, action: 'priority',
        metadata: { from: task.priority, to: dto.priority }, notifyType: null,
      })
    })
    return this.withCollaborators(id)
  }

  async setProgress(me: Me, id: string, dto: ProgressDto) {
    const task = await this.loadOr404(id)
    this.policy.assert(this.policy.canUpdateStatus(me, task), 'Không có quyền cập nhật tiến độ')
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { progress: dto.progress } })
      await this.notifications.emit(tx, {
        task, actorId: me.id, action: 'progress',
        metadata: { to: dto.progress }, notifyType: null,
      })
    })
    return this.withCollaborators(id)
  }

  // ── Sửa field phụ (title/description/section) — không phát activity ──
  async updateFields(me: Me, id: string, dto: UpdateTaskDto) {
    const task = await this.loadOr404(id)
    const onlyDescription = Object.keys(dto).every((k) => k === 'description')
    const allowed = onlyDescription ? this.policy.canUpdateStatus(me, task) : this.policy.canManage(me, task)
    this.policy.assert(allowed, 'Không có quyền sửa công việc')
    await this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.section !== undefined ? { section: dto.section as any } : {}),
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
          : {}),
      },
    })
    return this.withCollaborators(id)
  }

  // ── Xóa mềm (archive) ──
  async archive(me: Me, id: string) {
    const task = await this.loadOr404(id)
    this.policy.assert(this.policy.canManage(me, task), 'Không có quyền xóa công việc')
    await this.prisma.task.update({ where: { id }, data: { archived: true } })
    return { archived: true }
  }
}
