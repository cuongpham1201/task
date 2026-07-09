import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PolicyService } from '../common/policy.service'
import { VisibilityService, type Me } from '../common/visibility.service'
import type { CreateActionDto, CreateActionUpdateDto, UpdateActionDto } from './action.dto'

/**
 * Action = cam kết/mục tiêu quản lý của 1 Org Unit (freeze §1). KHÔNG assignee, KHÔNG review,
 * KHÔNG KPI. Nhật ký điều hành (action_updates) APPEND-ONLY.
 */
@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly vis: VisibilityService,
  ) {}

  private serialize(a: any) {
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      orgUnitId: a.orgUnitId,
      projectId: a.projectId,
      ownerId: a.ownerId,
      deadline: a.deadline,
      status: a.status,
      priority: a.priority,
      progressMode: a.progressMode,
      progress: a.progress,
      period: a.period,
      createdById: a.createdById,
      archived: a.archived,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      ...(a._count ? { taskCount: a._count.tasks } : {}),
      ...(a.updates ? { latestUpdate: a.updates[0] ? this.serializeUpdate(a.updates[0]) : null } : {}),
    }
  }

  private serializeUpdate(u: any) {
    return {
      id: u.id, actionId: u.actionId, authorId: u.authorId, type: u.type,
      content: u.content, progressValue: u.progressValue,
      statusFrom: u.statusFrom, statusTo: u.statusTo, createdAt: u.createdAt,
    }
  }

  private async loadRaw(id: string) {
    const a = await this.prisma.action.findUnique({ where: { id } })
    if (!a || a.archived) throw new NotFoundException('Không tìm thấy Action')
    return a
  }

  private async assertView(me: Me, action: any) {
    if (me.role === 'admin') return
    if (action.ownerId === me.id || action.createdById === me.id) return
    const orgIds = await this.vis.visibleOrgUnitIds(me)
    if (!orgIds.includes(action.orgUnitId)) throw new ForbiddenException('Không có quyền xem Action này')
  }

  // GET /actions?scope=my-org|block|company&period=&orgUnitId=
  async list(me: Me, opts: { period?: string; orgUnitId?: string }) {
    const where: any = { AND: [{ archived: false }, await this.vis.actionWhere(me)] }
    if (opts.period) where.AND.push({ period: opts.period })
    if (opts.orgUnitId) where.AND.push({ orgUnitId: opts.orgUnitId })
    const actions = await this.prisma.action.findMany({
      where,
      include: {
        _count: { select: { tasks: true } },
        updates: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
    })
    return actions.map((a) => this.serialize(a))
  }

  async create(me: Me, dto: CreateActionDto) {
    const org = await this.prisma.orgUnit.findUnique({ where: { id: dto.orgUnitId } })
    if (!org) throw new BadRequestException('Org unit không tồn tại')
    this.policy.assert(await this.policy.canCreateAction(me, dto.orgUnitId), 'Không có quyền tạo Action cho đơn vị này')
    const a = await this.prisma.action.create({
      data: {
        title: dto.title,
        description: dto.description ?? '',
        orgUnitId: dto.orgUnitId,
        projectId: dto.projectId ?? null,
        ownerId: dto.ownerId ?? me.id,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        priority: (dto.priority as any) ?? 'normal',
        progressMode: (dto.progressMode as any) ?? 'manual',
        period: dto.period ?? null,
        createdById: me.id,
      },
    })
    return this.serialize(a)
  }

  // GET /actions/:id — chi tiết + nhật ký + task liên quan (đã scope)
  async detail(me: Me, id: string) {
    const a = await this.loadRaw(id)
    await this.assertView(me, a)
    const [updates, tasks] = await Promise.all([
      this.prisma.actionUpdate.findMany({ where: { actionId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.task.findMany({
        where: { AND: [{ actionId: id }, { archived: false }, await this.vis.taskWhere(me)] },
        select: { id: true, title: true, status: true, assigneeId: true, dueDate: true, progress: true, priority: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])
    return { ...this.serialize(a), updates: updates.map((u) => this.serializeUpdate(u)), tasks }
  }

  // GET /actions/:id/tasks
  async tasksOf(me: Me, id: string) {
    const a = await this.loadRaw(id)
    await this.assertView(me, a)
    return this.prisma.task.findMany({
      where: { AND: [{ actionId: id }, { archived: false }, await this.vis.taskWhere(me)] },
      select: { id: true, title: true, status: true, assigneeId: true, dueDate: true, progress: true, priority: true },
      orderBy: { createdAt: 'asc' },
    })
  }

  async update(me: Me, id: string, dto: UpdateActionDto) {
    const a = await this.loadRaw(id)
    this.policy.assert(await this.policy.canManageAction(me, a), 'Không có quyền sửa Action')
    const updated = await this.prisma.action.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
        ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
        ...(dto.deadline !== undefined ? { deadline: dto.deadline ? new Date(dto.deadline) : null } : {}),
        ...(dto.status !== undefined ? { status: dto.status as any } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority as any } : {}),
        ...(dto.progressMode !== undefined ? { progressMode: dto.progressMode as any } : {}),
        ...(dto.progress !== undefined ? { progress: dto.progress } : {}),
        ...(dto.period !== undefined ? { period: dto.period } : {}),
      },
    })
    return this.serialize(updated)
  }

  async archive(me: Me, id: string) {
    const a = await this.loadRaw(id)
    this.policy.assert(await this.policy.canManageAction(me, a), 'Không có quyền lưu trữ Action')
    await this.prisma.action.update({ where: { id }, data: { archived: true } })
    return { archived: true }
  }

  // ── Nhật ký điều hành (append-only) ──
  async listUpdates(me: Me, id: string) {
    const a = await this.loadRaw(id)
    await this.assertView(me, a)
    const rows = await this.prisma.actionUpdate.findMany({ where: { actionId: id }, orderBy: { createdAt: 'desc' } })
    return rows.map((u) => this.serializeUpdate(u))
  }

  // POST /actions/:id/updates — chỉ APPEND; có thể kèm chuyển status/progress (ghi statusFrom/To)
  async addUpdate(me: Me, id: string, dto: CreateActionUpdateDto) {
    const a = await this.loadRaw(id)
    this.policy.assert(await this.policy.canManageAction(me, a), 'Không có quyền cập nhật nhật ký Action')
    const statusFrom = dto.statusTo ? a.status : null
    const created = await this.prisma.$transaction(async (tx) => {
      const u = await tx.actionUpdate.create({
        data: {
          actionId: id,
          authorId: me.id,
          type: dto.type as any,
          content: dto.content,
          progressValue: dto.progressValue ?? null,
          statusFrom: statusFrom as any,
          statusTo: (dto.statusTo as any) ?? null,
        },
      })
      // Đồng bộ trạng thái/tiến độ Action từ update (progress chỉ khi progressMode=manual)
      const data: any = {}
      if (dto.statusTo) data.status = dto.statusTo
      if (dto.progressValue != null && a.progressMode === 'manual') data.progress = dto.progressValue
      if (Object.keys(data).length) await tx.action.update({ where: { id }, data })
      return u
    })
    return this.serializeUpdate(created)
  }
}
