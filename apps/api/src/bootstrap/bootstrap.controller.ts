import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { NotificationsService } from '../notifications/notifications.service'
import { VisibilityService } from '../common/visibility.service'

// Dữ liệu khởi tạo frontend — ĐÃ SCOPE theo quyền (không trả task ngoài phạm vi).
// Map workspace → shape FE cũ: scope/departmentId/channelId; department kèm workspaceId.
@Controller('bootstrap')
@UseGuards(AuthGuard)
export class BootstrapController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly vis: VisibilityService,
  ) {}

  private serializeTask(t: any) {
    const { collaborators, workspace, ...rest } = t
    let scope = 'personal'
    let departmentId: string | null = null
    let channelId: string | null = null
    if (workspace?.type === 'org_unit') { scope = 'department'; departmentId = workspace.orgUnitId }
    else if (workspace?.type === 'project') { scope = 'channel'; channelId = workspace.id }
    return { ...rest, scope, departmentId, channelId, collaboratorIds: collaborators.map((c: any) => c.userId) }
  }

  @Get()
  async get(@AuthUser() claims: AuthClaims) {
    const me = await this.users.resolveFromClaims(claims)

    // ── Task đã scope theo quyền ──
    const tasksRaw = await this.prisma.task.findMany({
      where: { AND: [{ archived: false }, await this.vis.taskWhere(me)] },
      include: { collaborators: { select: { userId: true } }, workspace: true },
      orderBy: { createdAt: 'desc' },
    })
    const tasks = tasksRaw.map((t) => this.serializeTask(t))
    const taskIds = tasksRaw.map((t) => t.id)

    // ── Chỉ lấy dữ liệu liên quan các task được xem ──
    const [subtasks, comments, activitiesRaw] = await Promise.all([
      this.prisma.subtask.findMany({ where: { taskId: { in: taskIds } }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.comment.findMany({ where: { taskId: { in: taskIds }, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
      this.prisma.activity.findMany({ where: { taskId: { in: taskIds } }, orderBy: { createdAt: 'asc' } }),
    ])
    const activities = activitiesRaw.map((a) => ({
      id: String(a.id), taskId: a.taskId, userId: a.userId, action: a.action, metadata: a.metadata, createdAt: a.createdAt,
    }))

    // ── Cây tổ chức được xem (khối + phòng ban) ──
    const visibleOrgIds = await this.vis.visibleOrgUnitIds(me)
    const allOrg = await this.prisma.orgUnit.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
    const orgWorkspaces = await this.prisma.workspace.findMany({ where: { type: 'org_unit' }, select: { id: true, orgUnitId: true } })
    const wsByOrg = new Map(orgWorkspaces.map((w) => [w.orgUnitId, w.id]))
    // Trưởng phòng/quản lý từ org_unit_roles (department_manager)
    const mgrRoles = await this.prisma.orgUnitRole.findMany({
      where: { role: 'department_manager', active: true },
      include: { user: { select: { displayName: true } } },
    })
    const mgrByOrg = new Map(mgrRoles.map((r) => [r.orgUnitId, r.user.displayName]))
    const departments = allOrg
      .filter((o) => o.type === 'department' && (me.role === 'admin' || visibleOrgIds.includes(o.id)))
      .map((o) => ({ id: o.id, name: o.name, code: o.code, blockId: o.parentId, legalEntity: o.legalEntity, workspaceId: wsByOrg.get(o.id) ?? null, managerName: mgrByOrg.get(o.id) ?? null }))
    const blockIds = new Set(departments.map((d) => d.blockId).filter(Boolean) as string[])
    const blocks = allOrg.filter((o) => o.type === 'block' && blockIds.has(o.id)).map((o) => ({ id: o.id, name: o.name, code: o.code }))

    // ── Dự án (PROJECT workspace) user là member ──
    const myProjectIds = (await this.prisma.workspaceMember.findMany({ where: { userId: me.id }, select: { workspaceId: true } })).map((m) => m.workspaceId)
    const projWs = await this.prisma.workspace.findMany({
      where: { type: 'project', archived: false, ...(me.role === 'admin' ? {} : { id: { in: myProjectIds } }) },
      include: { members: { select: { userId: true } } },
      orderBy: { createdAt: 'asc' },
    })
    const channels = projWs.map((w) => ({ id: w.id, name: w.name, description: w.description, ownerId: w.ownerId, members: w.members.map((m) => m.userId) }))

    const users = await this.prisma.user.findMany({
      where: { active: true },
      select: { id: true, email: true, displayName: true, orgUnitId: true, role: true, jobTitle: true, avatarUrl: true },
      orderBy: { displayName: 'asc' },
    })

    // ── Actions đã scope (kèm latest update — KHÔNG preload toàn bộ history) ──
    const actionsRaw = await this.prisma.action.findMany({
      where: { AND: [{ archived: false }, await this.vis.actionWhere(me)] },
      include: { _count: { select: { tasks: true } }, updates: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
    })
    const actions = actionsRaw.map((a) => ({
      id: a.id, title: a.title, description: a.description, orgUnitId: a.orgUnitId, projectId: a.projectId,
      ownerId: a.ownerId, deadline: a.deadline, status: a.status, priority: a.priority,
      progressMode: a.progressMode, progress: a.progress, period: a.period, createdById: a.createdById,
      archived: a.archived, createdAt: a.createdAt, updatedAt: a.updatedAt, taskCount: a._count.tasks,
      latestUpdate: a.updates[0]
        ? { type: a.updates[0].type, content: a.updates[0].content, createdAt: a.updates[0].createdAt }
        : null,
    }))

    // Counts tiện dụng (không thay việc scope FE)
    const managed = await this.vis.managedOrgUnitIds(me)
    const [pendingReviewCount, myActionCount] = await Promise.all([
      this.prisma.task.count({
        where: { archived: false, status: 'submitted', OR: [{ creatorId: me.id }, { orgUnitId: { in: managed } }] },
      }),
      this.prisma.action.count({ where: { archived: false, ownerId: me.id } }),
    ])

    return {
      users,
      blocks,
      departments,
      channels,
      tasks,
      subtasks,
      comments,
      activities,
      actions,
      counts: { pendingReviewCount, myActionCount },
      notifications: await this.notifications.listForUser(me),
    }
  }
}
