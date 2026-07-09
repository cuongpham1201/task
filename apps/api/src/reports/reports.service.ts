import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { VisibilityService, type Me } from '../common/visibility.service'

/**
 * Action Log report (freeze §9): group Khối → Phòng → Action.
 * Scope tự động theo vai trò qua actionWhere (TGĐ toàn cty / GĐ khối / TP phòng).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vis: VisibilityService,
  ) {}

  async actionLog(me: Me, opts: { period?: string; orgUnitId?: string }) {
    const where: any = { AND: [{ archived: false }, await this.vis.actionWhere(me)] }
    if (opts.period) where.AND.push({ period: opts.period })
    if (opts.orgUnitId) where.AND.push({ orgUnitId: opts.orgUnitId })

    const [actions, orgUnits] = await Promise.all([
      this.prisma.action.findMany({
        where,
        include: {
          _count: { select: { tasks: true } },
          updates: { orderBy: { createdAt: 'desc' }, take: 1 },
          owner: { select: { id: true, displayName: true } },
        },
        orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.orgUnit.findMany({ where: { active: true }, select: { id: true, name: true, code: true, type: true, parentId: true } }),
    ])

    const orgById = new Map(orgUnits.map((o) => [o.id, o]))
    // Tìm block tổ tiên của 1 org unit (đi lên tới type=block)
    const blockOf = (orgId: string): { id: string; name: string; code: string } | null => {
      let cur = orgById.get(orgId)
      let guard = 0
      while (cur && guard++ < 10) {
        if (cur.type === 'block') return { id: cur.id, name: cur.name, code: cur.code }
        cur = cur.parentId ? orgById.get(cur.parentId) : undefined
      }
      return null
    }

    const ser = (a: any) => ({
      id: a.id, title: a.title, orgUnitId: a.orgUnitId, projectId: a.projectId,
      ownerId: a.ownerId, ownerName: a.owner?.displayName ?? null,
      deadline: a.deadline, status: a.status, priority: a.priority,
      progress: a.progress, period: a.period, taskCount: a._count.tasks,
      latestUpdate: a.updates[0]
        ? { type: a.updates[0].type, content: a.updates[0].content, createdAt: a.updates[0].createdAt }
        : null,
    })

    // Group: block → department → actions
    const blocks = new Map<string, any>()
    const NO_BLOCK = '__no_block__'
    for (const a of actions) {
      const dept = orgById.get(a.orgUnitId)
      const blk = blockOf(a.orgUnitId) ?? { id: NO_BLOCK, name: 'Khác', code: '' }
      if (!blocks.has(blk.id)) blocks.set(blk.id, { id: blk.id, name: blk.name, code: blk.code, departments: new Map() })
      const b = blocks.get(blk.id)
      const deptId = dept?.id ?? '__no_dept__'
      if (!b.departments.has(deptId)) {
        b.departments.set(deptId, { id: deptId, name: dept?.name ?? 'Khác', code: dept?.code ?? '', actions: [] })
      }
      b.departments.get(deptId).actions.push(ser(a))
    }

    return {
      period: opts.period ?? null,
      total: actions.length,
      blocks: [...blocks.values()].map((b) => ({
        id: b.id, name: b.name, code: b.code,
        departments: [...b.departments.values()],
      })),
    }
  }
}
