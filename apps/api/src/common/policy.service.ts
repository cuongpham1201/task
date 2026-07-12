import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { VisibilityService, type Me } from './visibility.service'

// Task chỉ cần các chiều này để xét quyền (freeze §7/§8).
type TaskLike = { id?: string; creatorId: string; assigneeId: string; orgUnitId: string | null; projectId: string | null; reviewerId?: string | null }
type ActionLike = { orgUnitId: string; ownerId: string; createdById: string }

/**
 * Ủy quyền server-side theo Architecture Freeze V1.
 * Quản lý = admin ∨ creator/owner ∨ quản lý org_unit chịu trách nhiệm (org role != viewer)
 *          ∨ owner/manager của project. KHÔNG dùng workspace làm nguồn ACL chính nữa.
 */
@Injectable()
export class PolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vis: VisibilityService,
  ) {}

  /** User có quản lý org_unit này không (org role != viewer, gồm include_children). */
  private async managesOrgUnit(me: Me, orgUnitId: string | null): Promise<boolean> {
    if (!orgUnitId) return false
    const managed = await this.vis.managedOrgUnitIds(me)
    return managed.includes(orgUnitId)
  }

  /** User có là owner/manager của project (workspace type=project) không. */
  private async managesProject(me: Me, projectId: string | null): Promise<boolean> {
    if (!projectId) return false
    const m = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: projectId, userId: me.id } },
    })
    return !!m && (m.role === 'owner' || m.role === 'manager')
  }

  private async isProjectMember(me: Me, projectId: string | null): Promise<boolean> {
    if (!projectId) return false
    const m = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: projectId, userId: me.id } },
    })
    return !!m
  }

  // ── TASK ──
  async canManage(me: Me, task: TaskLike): Promise<boolean> {
    if (me.role === 'admin' || task.creatorId === me.id) return true
    if (await this.managesOrgUnit(me, task.orgUnitId)) return true
    return this.managesProject(me, task.projectId)
  }

  async canUpdateStatus(me: Me, task: TaskLike): Promise<boolean> {
    return task.assigneeId === me.id || this.canManage(me, task)
  }

  async canReview(me: Me, task: TaskLike): Promise<boolean> {
    if (me.role === 'admin') return true
    // P0-2: có reviewer CHỈ ĐỊNH → chỉ reviewer đó (hoặc admin) được nghiệm thu.
    if (task.reviewerId) return task.reviewerId === me.id
    // Task cũ chưa có reviewer (dữ liệu trước backfill/không reviewRequired): rule cũ.
    if (task.creatorId === me.id) return true
    if (await this.managesOrgUnit(me, task.orgUnitId)) return true
    return this.managesProject(me, task.projectId)
  }

  async canComment(me: Me, task: TaskLike): Promise<boolean> {
    return this.canView(me, task)
  }

  async canView(me: Me, task: TaskLike): Promise<boolean> {
    if (me.role === 'admin') return true
    if (task.creatorId === me.id || task.assigneeId === me.id) return true
    // P0-2: reviewer chỉ định xem được task cần mình nghiệm thu (KHÔNG mở rộng sang cả dự án/phòng)
    if (task.reviewerId === me.id) return true
    if (task.orgUnitId) {
      const orgIds = await this.vis.visibleOrgUnitIds(me)
      if (orgIds.includes(task.orgUnitId)) return true
    }
    if (await this.isProjectMember(me, task.projectId)) return true
    if (task.id) {
      const inv = await this.prisma.taskCollaborator.findFirst({ where: { taskId: task.id, userId: me.id } })
      if (inv) return true
    }
    return false
  }

  /** Có được tạo task với org_unit/project này không (freeze §7). */
  async canCreate(me: Me, dims: { orgUnitId: string | null; projectId: string | null }): Promise<boolean> {
    if (me.role === 'admin') return true
    // Task CÁ NHÂN (không org, không project — vd user chưa gắn phòng ban): luôn được.
    // Khôi phục hành vi trước A2 (if !workspaceId → true); visibility chỉ creator/assignee.
    if (!dims.orgUnitId && !dims.projectId) return true
    if (dims.projectId) {
      if (await this.isProjectMember(me, dims.projectId)) return true
    }
    if (dims.orgUnitId) {
      if (me.orgUnitId === dims.orgUnitId) return true
      if (await this.managesOrgUnit(me, dims.orgUnitId)) return true
    }
    return false
  }

  // ── ACTION (freeze §6/§7: Action là việc quản lý — chỉ quản lý org_unit/owner/creator/admin) ──
  async canManageAction(me: Me, action: ActionLike): Promise<boolean> {
    if (me.role === 'admin' || action.ownerId === me.id || action.createdById === me.id) return true
    return this.managesOrgUnit(me, action.orgUnitId)
  }

  /** Có được tạo Action cho org_unit này không (phải quản lý org_unit đó). */
  async canCreateAction(me: Me, orgUnitId: string): Promise<boolean> {
    if (me.role === 'admin') return true
    return this.managesOrgUnit(me, orgUnitId)
  }

  assert(cond: boolean, msg = 'Bạn không có quyền thực hiện thao tác này'): void {
    if (!cond) throw new ForbiddenException(msg)
  }
}
