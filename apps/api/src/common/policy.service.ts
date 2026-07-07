import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { VisibilityService, type Me } from './visibility.service'

type TaskLike = { creatorId: string; assigneeId: string; workspaceId: string | null }
type WorkspaceLike = { id: string; type: string; orgUnitId: string | null } | null

/**
 * Ủy quyền server-side theo mô hình org_units + workspace.
 * admin: toàn quyền · quản lý workspace: người quản lý org_unit phủ workspace (org role
 * != viewer) hoặc owner/manager của PROJECT · assignee/creator: quyền trên việc của mình.
 */
@Injectable()
export class PolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vis: VisibilityService,
  ) {}

  /** Người dùng có quản lý workspace chứa task không? */
  async managesWorkspace(me: Me, ws: WorkspaceLike): Promise<boolean> {
    if (me.role === 'admin') return true
    if (!ws) return false
    if (ws.type === 'project') {
      const m = await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: ws.id, userId: me.id } },
      })
      return !!m && (m.role === 'owner' || m.role === 'manager')
    }
    if (!ws.orgUnitId) return false
    const managed = await this.vis.managedOrgUnitIds(me)
    return managed.includes(ws.orgUnitId)
  }

  async canManage(me: Me, task: TaskLike, ws: WorkspaceLike): Promise<boolean> {
    return me.role === 'admin' || task.creatorId === me.id || this.managesWorkspace(me, ws)
  }

  async canUpdateStatus(me: Me, task: TaskLike, ws: WorkspaceLike): Promise<boolean> {
    return task.assigneeId === me.id || this.canManage(me, task, ws)
  }

  async canReview(me: Me, task: TaskLike, ws: WorkspaceLike): Promise<boolean> {
    return me.role === 'admin' || task.creatorId === me.id || this.managesWorkspace(me, ws)
  }

  async canComment(me: Me, task: TaskLike, ws: WorkspaceLike): Promise<boolean> {
    return this.canView(me, task, ws)
  }

  async canView(me: Me, task: TaskLike, ws: WorkspaceLike): Promise<boolean> {
    if (me.role === 'admin') return true
    if (task.creatorId === me.id || task.assigneeId === me.id) return true
    if (task.workspaceId) {
      const wsIds = await this.vis.visibleWorkspaceIds(me)
      if (wsIds.includes(task.workspaceId)) return true
    }
    const inv = await this.prisma.taskCollaborator.findFirst({
      where: { taskId: (task as any).id, userId: me.id },
    })
    return !!inv
  }

  /** Có được tạo task trong workspace này không? */
  async canCreate(me: Me, workspaceId: string | null): Promise<boolean> {
    if (me.role === 'admin') return true
    if (!workspaceId) return true // personal
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!ws) return false
    if (ws.type === 'project') {
      const m = await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: me.id } },
      })
      return !!m
    }
    // org_unit: thuộc phòng đó hoặc quản lý nó
    if (me.orgUnitId && me.orgUnitId === ws.orgUnitId) return true
    const managed = await this.vis.managedOrgUnitIds(me)
    return ws.orgUnitId ? managed.includes(ws.orgUnitId) : false
  }

  assert(cond: boolean, msg = 'Bạn không có quyền thực hiện thao tác này'): void {
    if (!cond) throw new ForbiddenException(msg)
  }
}
