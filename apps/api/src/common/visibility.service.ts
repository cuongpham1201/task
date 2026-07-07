import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export type Me = { id: string; role: string; orgUnitId: string | null }

/**
 * Tính phạm vi nhìn thấy theo cây tổ chức + workspace. Dùng cho MỌI query
 * list/search/report/bootstrap — scope ngay ở SQL, không lọc frontend.
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
        ...(managingOnly ? { role: { not: 'viewer' as any } } : {}),
      },
    })
    for (const r of roles) {
      if (r.scope === 'include_children') for (const id of descendants(r.orgUnitId)) set.add(id)
      else set.add(r.orgUnitId)
    }
    return set
  }

  /** Org units user được XEM (gồm phòng mình + phạm vi role). */
  visibleOrgUnitIds(me: Me) {
    return this.orgUnitIdsFromRoles(me, false).then((s) => [...s])
  }

  /** Org units user QUẢN LÝ (role != viewer) — dùng để cấp quyền edit/nghiệm thu. */
  managedOrgUnitIds(me: Me) {
    return this.orgUnitIdsFromRoles(me, true).then((s) => [...s])
  }

  /** Workspace ids user được xem (ORG_UNIT theo cây + PROJECT là member). */
  async visibleWorkspaceIds(me: Me): Promise<string[]> {
    const orgIds = await this.visibleOrgUnitIds(me)
    const [orgWs, projWs] = await Promise.all([
      this.prisma.workspace.findMany({
        where: { type: 'org_unit', orgUnitId: { in: orgIds } },
        select: { id: true },
      }),
      this.prisma.workspaceMember.findMany({
        where: { userId: me.id },
        select: { workspaceId: true },
      }),
    ])
    return [...new Set([...orgWs.map((w) => w.id), ...projWs.map((m) => m.workspaceId)])]
  }

  /** Prisma where để lọc task theo quyền (dùng cho list/bootstrap/search). */
  async taskWhere(me: Me): Promise<any> {
    if (me.role === 'admin') return {}
    const wsIds = await this.visibleWorkspaceIds(me)
    return {
      OR: [
        { creatorId: me.id },
        { assigneeId: me.id },
        { collaborators: { some: { userId: me.id } } },
        { watchers: { some: { userId: me.id } } },
        { workspaceId: { in: wsIds } },
      ],
    }
  }
}
