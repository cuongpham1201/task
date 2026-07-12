import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export type Me = { id: string; role: string; orgUnitId: string | null }

/**
 * Tính phạm vi nhìn thấy theo Architecture Freeze V1 §7.
 * Task/Action scope NGAY Ở SQL — không lọc frontend.
 * Task = creator ∨ assignee ∨ collaborator ∨ watcher ∨ org_unit(tree) ∨ project(member).
 * Action = org_unit(tree) ∨ owner ∨ creator. (project_id KHÔNG phải ACL — freeze §12a.)
 */
@Injectable()
export class VisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadTree() {
    const units = await this.prisma.orgUnit.findMany({
      where: { active: true },
      select: { id: true, parentId: true },
    })
    const childrenOf = new Map<string, string[]>()
    for (const u of units) {
      if (!u.parentId) continue
      const arr = childrenOf.get(u.parentId) ?? []
      arr.push(u.id)
      childrenOf.set(u.parentId, arr)
    }
    const descendants = (rootId: string): string[] => {
      const out: string[] = []
      const stack = [rootId]
      while (stack.length) {
        const x = stack.pop()!
        out.push(x)
        for (const c of childrenOf.get(x) ?? []) stack.push(c)
      }
      return out
    }
    return { units, descendants }
  }

  private async orgUnitIdsFromRoles(me: Me, managingOnly: boolean): Promise<Set<string>> {
    const { units, descendants } = await this.loadTree()
    if (me.role === 'admin') return new Set(units.map((u) => u.id))
    const set = new Set<string>()
    if (!managingOnly && me.orgUnitId) set.add(me.orgUnitId) // là thành viên phòng mình
    const roles = await this.prisma.orgUnitRole.findMany({
      where: {
        userId: me.id,
        active: true,
        // FEATURE-003 (PHẦN 1.7): org unit inactive → assignment không mở quyền dữ liệu
        orgUnit: { active: true },
        ...(managingOnly ? { role: { not: 'viewer' as any } } : {}),
      },
    })
    for (const r of roles) {
      if (r.scope === 'include_children') for (const id of descendants(r.orgUnitId)) set.add(id)
      else set.add(r.orgUnitId)
    }
    return set
  }

  /**
   * FEATURE-003: mở rộng MỘT assignment (giả định) thành danh sách org unit — dùng cho
   * preview ở admin. CÙNG thuật toán với engine — không duplicate ở frontend.
   */
  async expandScope(orgUnitId: string, scope: string): Promise<string[]> {
    const { descendants } = await this.loadTree()
    return scope === 'include_children' ? descendants(orgUnitId) : [orgUnitId]
  }

  /**
   * FEATURE-003: permission hiệu lực cho frontend (bootstrap). FE CHỈ dùng để show/hide;
   * backend vẫn enforce thật qua Policy/Visibility. Quyền nghiệp vụ suy từ org_unit_roles
   * (KHÔNG từ users.role='manager', KHÔNG từ jobTitle).
   */
  async effectivePermissions(me: Me) {
    const isAdmin = me.role === 'admin'
    const activeRoles = isAdmin
      ? []
      : await this.prisma.orgUnitRole.findMany({
          where: { userId: me.id, active: true, orgUnit: { active: true } },
          select: { role: true },
        })
    const managed = await this.managedOrgUnitIds(me)
    const hasOrgRole = activeRoles.length > 0
    return {
      isAdmin,
      hasOrgRole: isAdmin || hasOrgRole,
      // viewer được XEM Action Log/Reports trong phạm vi; role quản lý (≠viewer) mới tạo/sửa
      canViewActionLog: isAdmin || hasOrgRole,
      canManageActions: isAdmin || managed.length > 0,
      canViewReports: isAdmin || hasOrgRole,
      // org unit user QUẢN LÝ — FE gate nút sửa/nghiệm thu theo từng task/action
      managedOrgUnitIds: managed,
    }
  }

  /** Org units user được XEM (gồm phòng mình + phạm vi role). */
  visibleOrgUnitIds(me: Me) {
    return this.orgUnitIdsFromRoles(me, false).then((s) => [...s])
  }

  /** Org units user QUẢN LÝ (role != viewer) — dùng để cấp quyền edit/nghiệm thu. */
  managedOrgUnitIds(me: Me) {
    return this.orgUnitIdsFromRoles(me, true).then((s) => [...s])
  }

  /** Project ids (= workspace type=project) user là member. */
  async myProjectIds(me: Me): Promise<string[]> {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { userId: me.id },
      select: { workspaceId: true },
    })
    return rows.map((m) => m.workspaceId)
  }

  /** Prisma where lọc TASK theo quyền (freeze §7). */
  async taskWhere(me: Me): Promise<any> {
    if (me.role === 'admin') return {}
    const [orgIds, projIds] = await Promise.all([this.visibleOrgUnitIds(me), this.myProjectIds(me)])
    return {
      OR: [
        { creatorId: me.id },
        { assigneeId: me.id },
        { reviewerId: me.id }, // P0-2: người nghiệm thu chỉ định thấy task của mình
        { collaborators: { some: { userId: me.id } } },
        { watchers: { some: { userId: me.id } } },
        { orgUnitId: { in: orgIds } },
        { projectId: { in: projIds } },
      ],
    }
  }

  /** Prisma where lọc ACTION theo quyền (freeze §7: org_unit tree ∨ owner ∨ creator). */
  async actionWhere(me: Me): Promise<any> {
    if (me.role === 'admin') return {}
    const orgIds = await this.visibleOrgUnitIds(me)
    return {
      OR: [
        { orgUnitId: { in: orgIds } },
        { ownerId: me.id },
        { createdById: me.id },
      ],
    }
  }
}
