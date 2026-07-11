import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PolicyService } from '../common/policy.service'
import { VisibilityService, type Me } from '../common/visibility.service'
import { NotificationsService } from '../notifications/notifications.service'
import { TeamsActivityService } from '../teams/teams-activity.service'
import type {
  AssigneeDto, CollaboratorsDto, CreateTaskDto, DueDateDto, PriorityDto, ProgressDto, ReviewDto,
  TaskOrgUnitDto, UpdateTaskDto,
} from './task.dto'

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly vis: VisibilityService,
    private readonly notifications: NotificationsService,
    private readonly teams: TeamsActivityService,
  ) {}

  /** Deep link path của task (khớp FE ?task= + Teams subEntityId). */
  private taskPath(id: string) {
    return `/my-tasks?task=${id}`
  }

  // ── Đọc (đã scope theo quyền) — shape khớp frontend hiện tại + chiều mới ──
  async findAll(me: Me) {
    const where = { AND: [{ archived: false }, await this.vis.taskWhere(me)] }
    const tasks = await this.prisma.task.findMany({
      where,
      include: { collaborators: { select: { userId: true } }, watchers: { select: { userId: true } }, workspace: true, orgUnit: { select: { name: true } }, action: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return tasks.map((t) => this.serialize(t, t.collaborators.map((c) => c.userId)))
  }

  // Map → shape FE cũ (scope/departmentId/channelId, suy từ workspace để tương thích)
  // + phơi chiều tường minh mới (orgUnitId/projectId/actionId + KPI) + tên đơn vị/action cho FE.
  private serialize(task: any, collaboratorIds: string[]) {
    const { collaborators, watchers, workspace, orgUnit, action, ...rest } = task
    let scope = 'personal'
    let departmentId: string | null = null
    let channelId: string | null = null
    if (workspace?.type === 'org_unit') { scope = 'department'; departmentId = workspace.orgUnitId }
    else if (workspace?.type === 'project') { scope = 'channel'; channelId = workspace.id }
    return {
      ...rest, scope, departmentId, channelId, collaboratorIds,
      watcherIds: (watchers ?? []).map((w: any) => w.userId),
      orgUnitName: orgUnit?.name ?? null, actionTitle: action?.title ?? null,
    }
  }

  private async load(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } })
    if (!task || task.archived) throw new NotFoundException('Không tìm thấy công việc')
    return task
  }

  private async withCollaborators(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { collaborators: { select: { userId: true } }, watchers: { select: { userId: true } }, workspace: true, orgUnit: { select: { name: true } }, action: { select: { title: true } } },
    })
    return this.serialize(task, task!.collaborators.map((c) => c.userId))
  }

  // Suy chiều tường minh + workspaceId (giữ để serialize FE cũ) từ DTO.
  // Ưu tiên chiều mới; nếu FE cũ chỉ gửi workspaceId thì suy ngược.
  private async resolveDims(me: Me, dto: CreateTaskDto) {
    const assigneeId = dto.assigneeId ?? me.id
    let orgUnitId = dto.orgUnitId ?? null
    let projectId = dto.projectId ?? null
    let workspaceId = dto.workspaceId ?? null
    const actionId = dto.actionId ?? null

    if (workspaceId) {
      // FE cũ: suy org/project từ workspace
      const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } })
      if (!ws) throw new BadRequestException('Workspace không tồn tại')
      if (ws.type === 'org_unit') { orgUnitId = orgUnitId ?? ws.orgUnitId; projectId = null }
      else if (ws.type === 'project') { projectId = projectId ?? ws.id }
    } else if (projectId) {
      // A3: gửi projectId trực tiếp → workspaceId = projectId (P1: project = workspace)
      workspaceId = projectId
    } else if (orgUnitId) {
      // A3: task phòng ban → workspaceId = workspace org_unit tương ứng (FE compat)
      const ws = await this.prisma.workspace.findFirst({ where: { type: 'org_unit', orgUnitId } })
      workspaceId = ws?.id ?? null
    }

    // org_unit BẮT BUỘC ở tầng nghiệp vụ: personal/project lấy org của assignee→creator (freeze §Q1/Q3)
    if (!orgUnitId) {
      const [a, c] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: assigneeId }, select: { orgUnitId: true } }),
        this.prisma.user.findUnique({ where: { id: me.id }, select: { orgUnitId: true } }),
      ])
      orgUnitId = a?.orgUnitId ?? c?.orgUnitId ?? null
    }

    return { orgUnitId, projectId, actionId, workspaceId, assigneeId }
  }

  // ── Tạo ──
  async create(me: Me, dto: CreateTaskDto) {
    const dims = await this.resolveDims(me, dto)

    // Rule KPI (freeze §8): is_scorable ⇒ review_required + kpi_definition + kpi_weight
    const isScorable = dto.isScorable === true
    const reviewRequired = isScorable ? true : (dto.reviewRequired ?? dto.completionMode === 'review_required')
    if (isScorable) {
      if (!dto.kpiDefinitionId) throw new BadRequestException('Task tính KPI phải chọn KPI definition')
      if (dto.kpiWeight == null) throw new BadRequestException('Task tính KPI phải có trọng số (kpi_weight)')
    }
    if (dto.actionId) {
      const act = await this.prisma.action.findUnique({ where: { id: dto.actionId } })
      if (!act || act.archived) throw new BadRequestException('Action không tồn tại')
    }

    this.policy.assert(
      await this.policy.canCreate(me, { orgUnitId: dims.orgUnitId, projectId: dims.projectId }),
      'Không có quyền tạo việc trong phạm vi này',
    )

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description ?? '',
          expectedOutput: dto.expectedOutput ?? '',
          workspaceId: dims.workspaceId,
          orgUnitId: dims.orgUnitId,
          projectId: dims.projectId,
          actionId: dims.actionId,
          section: (dto.section as any) ?? null,
          creatorId: me.id,
          assigneeId: dims.assigneeId,
          priority: (dto.priority as any) ?? 'normal',
          completionMode: (reviewRequired ? 'review_required' : 'self') as any,
          reviewRequired,
          isScorable,
          kpiDefinitionId: isScorable ? dto.kpiDefinitionId : null,
          kpiWeight: isScorable ? dto.kpiWeight : null,
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
    // Teams Activity (fire-and-forget, SAU commit): giao việc cho assignee
    this.teams.sendMany([{
      type: 'taskAssigned', recipientUserId: task.assigneeId, actorUserId: me.id,
      targetType: 'task', targetId: task.id, taskInfo: task.title,
      previewText: 'Bạn được giao một công việc mới', path: this.taskPath(task.id),
      eventSuffix: 'create',
    }])
    const serialized = await this.withCollaborators(task.id)
    const subtasks = await this.prisma.subtask.findMany({ where: { taskId: task.id }, orderBy: { sortOrder: 'asc' } })
    return { ...serialized, subtasks }
  }

  // ── Trạng thái ──
  async setStatus(me: Me, id: string, status: string) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canUpdateStatus(me, task), 'Không có quyền đổi trạng thái')
    if (task.status === 'submitted' && !(await this.policy.canReview(me, task))) {
      throw new BadRequestException('Việc đang chờ nghiệm thu — chờ kết quả Đạt/Trả lại.')
    }
    if (status === 'done' && task.reviewRequired && !(await this.policy.canReview(me, task))) {
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
    this.policy.assert(task.assigneeId === me.id || (await this.policy.canManage(me, task)), 'Chỉ người được giao mới nộp nghiệm thu')
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { status: 'submitted' as any } })
      await this.notifications.emit(tx, { task, actorId: me.id, action: 'review', metadata: { to: 'submitted' }, notifyType: 'task_assigned', extraRecipients: [task.creatorId] })
    })
    return this.withCollaborators(id)
  }

  async review(me: Me, id: string, dto: ReviewDto) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canReview(me, task), 'Không có quyền nghiệm thu công việc này')
    const passed = dto.decision === 'passed'
    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.taskReview.upsert({
        where: { taskId: id },
        create: { taskId: id, reviewerId: me.id, decision: dto.decision as any, note: dto.note ?? '' },
        update: { reviewerId: me.id, decision: dto.decision as any, note: dto.note ?? '', reviewedAt: now },
      })
      await tx.task.update({
        where: { id },
        data: passed
          ? { status: 'done' as any, completedAt: now, acceptedAt: now, completedById: task.assigneeId, progress: 100 }
          : { status: 'returned' as any, completedAt: null, acceptedAt: null, completedById: null },
      })
      // KPI evidence (freeze §8): CHỈ sinh khi is_scorable=true (sửa bug: trước đây sinh cho mọi task).
      if (passed && task.isScorable) {
        const [assignee, reviewer] = await Promise.all([
          tx.user.findUnique({ where: { id: task.assigneeId }, select: { entraId: true, orgUnitId: true } }),
          tx.user.findUnique({ where: { id: me.id }, select: { entraId: true } }),
        ])
        const onTime = task.dueDate ? now.getTime() <= new Date(task.dueDate).getTime() + 86_399_999 : null
        await tx.taskKpiResult.upsert({
          where: { idempotencyKey: `taskhub:${id}:review` },
          create: {
            taskId: id,
            entraObjectId: assignee?.entraId ?? '',
            orgUnitId: task.orgUnitId,
            kpiDefinitionId: task.kpiDefinitionId,
            kpiWeight: task.kpiWeight,
            dueDate: task.dueDate,
            completedAt: now,
            acceptedAt: now,
            onTime,
            reviewResult: 'accepted',
            evidenceNote: dto.note ?? null,
            reviewedById: me.id,
            reviewedAt: now,
            reviewerEntraId: reviewer?.entraId ?? null,
            idempotencyKey: `taskhub:${id}:review`,
            pushStatus: 'pending' as any,
          },
          update: { acceptedAt: now, reviewedAt: now, onTime, reviewResult: 'accepted', pushStatus: 'pending' as any },
        })
      }
      await this.notifications.emit(tx, { task, actorId: me.id, action: 'review', metadata: { decision: dto.decision }, notifyType: passed ? 'task_accepted' : 'task_returned' })
    })
    // Teams Activity: kết quả nghiệm thu cho người thực hiện (suffix = mốc review → idempotent per review)
    this.teams.sendMany([{
      type: passed ? 'taskAccepted' : 'taskReturned',
      recipientUserId: task.assigneeId, actorUserId: me.id,
      targetType: 'task', targetId: id, taskInfo: task.title,
      previewText: passed ? 'Công việc của bạn đã được nghiệm thu Đạt' : `Bị trả lại${dto.note ? ': ' + dto.note : ''}`,
      path: this.taskPath(id), eventSuffix: String(now.getTime()),
    }])
    return this.withCollaborators(id)
  }

  async setAssignee(me: Me, id: string, dto: AssigneeDto) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canManage(me, task), 'Không có quyền đổi người phụ trách')
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { assigneeId: dto.assigneeId } })
      await this.notifications.emit(tx, { task: { ...task, assigneeId: dto.assigneeId }, actorId: me.id, action: 'assign', metadata: { from: task.assigneeId, to: dto.assigneeId }, notifyType: 'task_assigned', extraRecipients: [dto.assigneeId] })
    })
    // Teams Activity: giao lại cho người thực hiện mới
    this.teams.sendMany([{
      type: 'taskAssigned', recipientUserId: dto.assigneeId, actorUserId: me.id,
      targetType: 'task', targetId: id, taskInfo: task.title,
      previewText: 'Bạn được giao một công việc', path: this.taskPath(id),
      eventSuffix: `assign-${Date.now()}`,
    }])
    return this.withCollaborators(id)
  }

  /** FEATURE-004: sửa người phối hợp sau khi tạo — client gửi TOÀN BỘ danh sách, server diff. */
  async setCollaborators(me: Me, id: string, dto: CollaboratorsDto) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canManage(me, task), 'Không có quyền sửa người phối hợp')
    const ids = [...new Set(dto.collaboratorIds)].filter((u) => u !== task.assigneeId) // assignee không cần là collaborator
    const found = await this.prisma.user.count({ where: { id: { in: ids }, active: true } })
    if (found !== ids.length) throw new BadRequestException('Danh sách người phối hợp có người không hợp lệ')
    const current = (await this.prisma.taskCollaborator.findMany({ where: { taskId: id }, select: { userId: true } })).map((c) => c.userId)
    const added = ids.filter((u) => !current.includes(u))
    await this.prisma.$transaction(async (tx) => {
      await tx.taskCollaborator.deleteMany({ where: { taskId: id, userId: { notIn: ids } } }) // chỉ trong phạm vi task này
      if (added.length) await tx.taskCollaborator.createMany({ data: added.map((userId) => ({ taskId: id, userId })), skipDuplicates: true })
      await this.notifications.emit(tx, {
        task, actorId: me.id, action: 'collaborator', metadata: { from: current, to: ids },
        notifyType: added.length ? 'task_assigned' : null, extraRecipients: added,
      })
    })
    return this.withCollaborators(id)
  }

  /** FEATURE-004: chuyển đơn vị yêu cầu (org_unit) của task — kèm chuyển workspace department tương ứng. */
  async setOrgUnit(me: Me, id: string, dto: TaskOrgUnitDto) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canManage(me, task), 'Không có quyền chuyển đơn vị của việc này')
    const org = await this.prisma.orgUnit.findUnique({ where: { id: dto.orgUnitId } })
    if (!org || !org.active) throw new BadRequestException('Đơn vị không tồn tại hoặc đã ngưng hoạt động')
    // Người chuyển phải có quyền tạo việc ở đơn vị ĐÍCH (thuộc biên chế hoặc quản lý nó)
    this.policy.assert(
      await this.policy.canCreate(me, { orgUnitId: dto.orgUnitId, projectId: task.projectId }),
      'Không có quyền chuyển việc sang đơn vị này',
    )
    // Task phòng ban (workspace org_unit) → workspace phải đi theo org mới; task dự án/cá nhân giữ workspace
    let workspaceId = task.workspaceId as string | null
    if (!task.projectId && workspaceId) {
      const ws = await this.prisma.workspace.findFirst({ where: { type: 'org_unit', orgUnitId: dto.orgUnitId } })
      workspaceId = ws?.id ?? workspaceId
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { orgUnitId: dto.orgUnitId, workspaceId } })
      await this.notifications.emit(tx, {
        task, actorId: me.id, action: 'edit', metadata: { field: 'orgUnit', from: task.orgUnitId, to: dto.orgUnitId }, notifyType: null,
      })
    })
    return this.withCollaborators(id)
  }

  async setDueDate(me: Me, id: string, dto: DueDateDto) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canManage(me, task), 'Không có quyền đổi deadline')
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } })
      await this.notifications.emit(tx, { task, actorId: me.id, action: 'due', metadata: { to: dto.dueDate ?? null }, notifyType: null })
    })
    return this.withCollaborators(id)
  }

  async setPriority(me: Me, id: string, dto: PriorityDto) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canManage(me, task), 'Không có quyền đổi ưu tiên')
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { priority: dto.priority as any } })
      await this.notifications.emit(tx, { task, actorId: me.id, action: 'priority', metadata: { from: task.priority, to: dto.priority }, notifyType: null })
    })
    return this.withCollaborators(id)
  }

  async setProgress(me: Me, id: string, dto: ProgressDto) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canUpdateStatus(me, task), 'Không có quyền cập nhật tiến độ')
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
      ? await this.policy.canUpdateStatus(me, task)
      : await this.policy.canManage(me, task)
    this.policy.assert(allowed, 'Không có quyền sửa công việc')
    const fields = Object.keys(dto)
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.expectedOutput !== undefined ? { expectedOutput: dto.expectedOutput } : {}),
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
    this.policy.assert(await this.policy.canManage(me, task), 'Không có quyền xóa công việc')
    await this.prisma.task.update({ where: { id }, data: { archived: true } })
    return { archived: true }
  }

  // ── Nhật ký thực hiện (work log, append-only) ──
  async listWorkLogs(me: Me, id: string) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canView(me, task), 'Không có quyền xem nhật ký')
    const rows = await this.prisma.taskWorkLog.findMany({ where: { taskId: id }, orderBy: { createdAt: 'desc' } })
    return rows.map((r) => ({ id: r.id, taskId: r.taskId, authorId: r.authorId, content: r.content, progressValue: r.progressValue, createdAt: r.createdAt }))
  }

  /**
   * Nhật ký thực hiện. % của MỖI nhật ký là phần đóng góp CỘNG DỒN vào tiến độ task
   * (không phải giá trị tuyệt đối). Tổng các % không vượt 100 — kiểm tra TRONG
   * transaction để 2 người ghi đồng thời không lách được.
   */
  async addWorkLog(me: Me, id: string, dto: { content: string; progressValue?: number }) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canUpdateStatus(me, task), 'Không có quyền ghi nhật ký thực hiện')
    const { row, total } = await this.prisma.$transaction(async (tx) => {
      let newTotal: number | null = null
      if (dto.progressValue != null) {
        const agg = await tx.taskWorkLog.aggregate({ where: { taskId: id }, _sum: { progressValue: true } })
        const used = agg._sum.progressValue ?? 0
        newTotal = used + dto.progressValue
        if (newTotal > 100) {
          throw new BadRequestException(`Tổng tiến độ vượt 100% — đã ghi nhận ${used}%, chỉ còn nhập tối đa ${100 - used}%`)
        }
      }
      const w = await tx.taskWorkLog.create({ data: { taskId: id, authorId: me.id, content: dto.content, progressValue: dto.progressValue ?? null } })
      if (newTotal != null) await tx.task.update({ where: { id }, data: { progress: newTotal } })
      // FEATURE-004: nhật ký thực hiện phải xuất hiện trong tab Hoạt động
      await this.notifications.emit(tx, {
        task, actorId: me.id, action: 'progress',
        metadata: { worklog: true, add: dto.progressValue ?? null, to: newTotal },
        notifyType: null,
      })
      return { row: w, total: newTotal }
    })
    return {
      id: row.id, taskId: row.taskId, authorId: row.authorId, content: row.content,
      progressValue: row.progressValue, createdAt: row.createdAt,
      taskProgress: total, // tổng mới sau nhật ký này (null nếu không kèm %)
    }
  }

  // ── Theo dõi (watcher) — ai xem được task đều theo dõi được ──
  async watch(me: Me, id: string) {
    const task = await this.load(id)
    this.policy.assert(await this.policy.canView(me, task), 'Không có quyền theo dõi công việc này')
    await this.prisma.taskWatcher.upsert({
      where: { taskId_userId: { taskId: id, userId: me.id } },
      create: { taskId: id, userId: me.id }, update: {},
    })
    return this.withCollaborators(id)
  }

  async unwatch(me: Me, id: string) {
    await this.load(id)
    await this.prisma.taskWatcher.deleteMany({ where: { taskId: id, userId: me.id } })
    return this.withCollaborators(id)
  }
}
