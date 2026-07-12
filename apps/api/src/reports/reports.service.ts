import { ForbiddenException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { VisibilityService, type Me } from '../common/visibility.service'
import {
  DUE_SOON_DAYS, DRILL_PAGE_SIZE_MAX, TREND_DEFAULT_DAYS,
  type ReportFilters, taskBaseWhere, bucketWhere, actionBaseWhere, parseRange, rate,
} from './report-rules'

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

    // Đếm task open/overdue/review per action (scope theo quyền) — cho mini badge Action Log
    const actionIds = actions.map((a) => a.id)
    const taskAgg: Record<string, { open: number; overdue: number; review: number; done: number }> = {}
    if (actionIds.length) {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const tasks = await this.prisma.task.findMany({
        where: { AND: [{ actionId: { in: actionIds }, archived: false }, await this.vis.taskWhere(me)] },
        select: { actionId: true, status: true, dueDate: true },
      })
      for (const t of tasks) {
        const k = t.actionId as string
        const a = (taskAgg[k] ??= { open: 0, overdue: 0, review: 0, done: 0 })
        if (t.status === 'done') a.done++
        else if (t.status !== 'paused') a.open++
        if (t.status === 'submitted') a.review++
        if (t.dueDate && t.status !== 'done' && new Date(t.dueDate) < today) a.overdue++
      }
    }

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
      taskOpen: taskAgg[a.id]?.open || 0,
      taskOverdue: taskAgg[a.id]?.overdue || 0,
      taskReview: taskAgg[a.id]?.review || 0,
      taskDone: taskAgg[a.id]?.done || 0,
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
  // ═══════════════ P1-1 — BÁO CÁO TỔNG HỢP BLĐ ═══════════════
  // Toàn bộ aggregate ở BACKEND (groupBy/count có index; raw SQL CHỈ cho trend vì cần
  // date_trunc — tham số hóa 100%). Drill-down dùng CHUNG where-builder (report-rules.ts)
  // với overview → khớp số tuyệt đối. Scope server-side: orgUnitId ∈ visibleOrgUnitIds.

  /** Gate quyền báo cáo + giao scope server-side. KHÔNG tin orgUnitId client. */
  private async resolveFilters(me: Me, q: any): Promise<ReportFilters> {
    const perms = await this.vis.effectivePermissions(me)
    if (!perms.canViewReports) {
      throw new ForbiddenException('Chỉ người có vai trò tổ chức phù hợp mới xem được báo cáo tổng hợp')
    }
    const scope = await this.vis.visibleOrgUnitIds(me)
    let orgUnitIds = scope
    if (q.orgUnitId) {
      if (!scope.includes(q.orgUnitId)) throw new ForbiddenException('Đơn vị ngoài phạm vi quyền của bạn')
      orgUnitIds = [q.orgUnitId]
    }
    const { from, to } = parseRange(q.from, q.to)
    return {
      from, to, orgUnitIds,
      projectId: q.projectId || undefined,
      actionId: q.actionId || undefined,
      assigneeId: q.assigneeId || undefined,
      status: q.status || undefined,
    }
  }

  async overview(me: Me, q: any) {
    const f = await this.resolveFilters(me, q)
    const now = new Date()
    const where = taskBaseWhere(f)

    // ── Task tổng hợp ──
    const completedRangeWhere: any = { ...where, status: 'done' }
    delete completedRangeWhere.createdAt
    if (f.from || f.to) completedRangeWhere.completedAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) }
    const [byStatusRaw, overdue, dueSoon, withProject, withAction, completedInRange] = await Promise.all([
      this.prisma.task.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.task.count({ where: { ...where, ...bucketWhere('overdue', now) } }),
      this.prisma.task.count({ where: { ...where, ...bucketWhere('dueSoon', now) } }),
      this.prisma.task.count({ where: { ...where, projectId: { not: null } } }),
      this.prisma.task.count({ where: { ...where, actionId: { not: null } } }),
      this.prisma.task.count({ where: completedRangeWhere }),
    ])
    const byStatus: Record<string, number> = { todo: 0, doing: 0, waiting: 0, submitted: 0, returned: 0, done: 0, paused: 0 }
    for (const r of byStatusRaw) byStatus[r.status] = (r._count as any)._all
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0)
    const active = total - byStatus.done

    // ── Trend theo ngày (raw: cần date_trunc; điều kiện = Prisma.sql tham số hóa) ──
    const trendFrom = f.from ?? new Date(now.getTime() - TREND_DEFAULT_DAYS * 86400000)
    const trendTo = f.to ?? now
    const conds: Prisma.Sql[] = [
      Prisma.sql`archived = false`,
      Prisma.sql`org_unit_id = ANY(${f.orgUnitIds})`,
    ]
    if (f.projectId) conds.push(Prisma.sql`project_id = ${f.projectId}`)
    if (f.actionId === 'none') conds.push(Prisma.sql`action_id IS NULL`)
    else if (f.actionId) conds.push(Prisma.sql`action_id = ${f.actionId}`)
    if (f.assigneeId) conds.push(Prisma.sql`assignee_id = ${f.assigneeId}`)
    if (f.status) conds.push(Prisma.sql`status = ${f.status}::task_status`)
    const base = Prisma.join(conds, ' AND ')
    const [createdRows, completedRows, lateRows] = await Promise.all([
      this.prisma.$queryRaw<{ d: Date; n: number }[]>(
        Prisma.sql`SELECT date_trunc('day', created_at) AS d, count(*)::int AS n FROM tasks
          WHERE ${base} AND created_at BETWEEN ${trendFrom} AND ${trendTo} GROUP BY 1 ORDER BY 1`,
      ),
      this.prisma.$queryRaw<{ d: Date; n: number }[]>(
        Prisma.sql`SELECT date_trunc('day', completed_at) AS d, count(*)::int AS n FROM tasks
          WHERE ${base} AND completed_at BETWEEN ${trendFrom} AND ${trendTo} GROUP BY 1 ORDER BY 1`,
      ),
      // lateOnDay: đến hạn ngày d và TRỄ (done sau hạn hoặc chưa done mà đã quá hạn)
      this.prisma.$queryRaw<{ d: Date; n: number }[]>(
        Prisma.sql`SELECT date_trunc('day', due_date) AS d, count(*)::int AS n FROM tasks
          WHERE ${base} AND due_date BETWEEN ${trendFrom} AND ${trendTo}
            AND ((completed_at IS NOT NULL AND completed_at > due_date)
              OR (status <> 'done' AND due_date < ${now}))
          GROUP BY 1 ORDER BY 1`,
      ),
    ])
    const dayKey = (d: Date) => d.toISOString().slice(0, 10)
    const trendMap = new Map<string, { date: string; created: number; completed: number; late: number }>()
    const touch = (k: string) => {
      if (!trendMap.has(k)) trendMap.set(k, { date: k, created: 0, completed: 0, late: 0 })
      return trendMap.get(k)!
    }
    for (const r of createdRows) touch(dayKey(r.d)).created = r.n
    for (const r of completedRows) touch(dayKey(r.d)).completed = r.n
    for (const r of lateRows) touch(dayKey(r.d)).late = r.n
    const trend = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date))

    // ── Theo đơn vị (set-based groupBy — KHÔNG query từng phòng trong vòng lặp) ──
    const [orgStatus, orgOverdue, orgWithProject, orgWithAction, orgAssignees, orgActions, orgMeta] = await Promise.all([
      this.prisma.task.groupBy({ by: ['orgUnitId', 'status'], where, _count: { _all: true } }),
      this.prisma.task.groupBy({ by: ['orgUnitId'], where: { ...where, ...bucketWhere('overdue', now) }, _count: { _all: true } }),
      this.prisma.task.groupBy({ by: ['orgUnitId'], where: { ...where, projectId: { not: null } }, _count: { _all: true } }),
      this.prisma.task.groupBy({ by: ['orgUnitId'], where: { ...where, actionId: { not: null } }, _count: { _all: true } }),
      this.prisma.task.groupBy({ by: ['orgUnitId', 'assigneeId'], where: { ...where, status: { not: 'done' } } }),
      this.prisma.action.groupBy({ by: ['orgUnitId'], where: actionBaseWhere(f), _count: { _all: true } }),
      this.prisma.orgUnit.findMany({
        where: { id: { in: f.orgUnitIds } },
        select: { id: true, name: true, code: true, legalEntity: true, type: true, parent: { select: { name: true } } },
      }),
    ])
    const orgRow: Record<string, any> = {}
    const orgInit = (id: string) => (orgRow[id] ??= { orgUnitId: id, total: 0, todo: 0, doing: 0, waiting: 0, submitted: 0, returned: 0, done: 0, paused: 0, overdue: 0, withProject: 0, withAction: 0, openAssignees: 0, actionCount: 0 })
    for (const r of orgStatus) { const o = orgInit(r.orgUnitId!); o[r.status] = (r._count as any)._all; o.total += (r._count as any)._all }
    for (const r of orgOverdue) orgInit(r.orgUnitId!).overdue = (r._count as any)._all
    for (const r of orgWithProject) orgInit(r.orgUnitId!).withProject = (r._count as any)._all
    for (const r of orgWithAction) orgInit(r.orgUnitId!).withAction = (r._count as any)._all
    const openByOrg = new Map<string, Set<string>>()
    for (const r of orgAssignees) {
      if (!openByOrg.has(r.orgUnitId!)) openByOrg.set(r.orgUnitId!, new Set())
      openByOrg.get(r.orgUnitId!)!.add(r.assigneeId)
    }
    for (const [id, set] of openByOrg) orgInit(id).openAssignees = set.size
    for (const r of orgActions) orgInit(r.orgUnitId).actionCount = (r._count as any)._all
    const metaById = new Map(orgMeta.map((o) => [o.id, o]))
    const byOrgUnit = Object.values(orgRow)
      .map((o: any) => {
        const m = metaById.get(o.orgUnitId)
        return {
          ...o,
          orgUnitName: m?.name ?? '—', code: m?.code ?? '', legalEntity: m?.legalEntity ?? null,
          parentName: m?.parent?.name ?? null, completionRate: rate(o.done, o.total),
        }
      })
      .sort((a: any, b: any) => b.total - a.total)

    // ── Action Log tổng hợp ──
    const aWhere = actionBaseWhere(f)
    if (f.actionId && f.actionId !== 'none') (aWhere as any).id = f.actionId
    const actions = await this.prisma.action.findMany({
      where: aWhere,
      select: {
        id: true, title: true, status: true, deadline: true, period: true, createdAt: true,
        orgUnit: { select: { id: true, name: true, legalEntity: true } },
        owner: { select: { id: true, displayName: true } },
      },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    })
    const actionIds2 = actions.map((a) => a.id)
    // Task của Action KHÔNG áp lọc createdAt kỳ (task có thể tạo trước kỳ nhưng thuộc action trong kỳ)
    const taskByActionWhere: any = { archived: false, actionId: { in: actionIds2 }, orgUnitId: { in: f.orgUnitIds } }
    if (f.assigneeId) taskByActionWhere.assigneeId = f.assigneeId
    const [actStatus, actOverdue] = await Promise.all([
      this.prisma.task.groupBy({ by: ['actionId', 'status'], where: taskByActionWhere, _count: { _all: true } }),
      this.prisma.task.groupBy({ by: ['actionId'], where: { ...taskByActionWhere, status: { not: 'done' }, dueDate: { lt: now } }, _count: { _all: true } }),
    ])
    const actAgg: Record<string, { total: number; done: number; overdue: number }> = {}
    const actInit = (id: string) => (actAgg[id] ??= { total: 0, done: 0, overdue: 0 })
    for (const r of actStatus) {
      const a = actInit(r.actionId!)
      a.total += (r._count as any)._all
      if (r.status === 'done') a.done = (r._count as any)._all
    }
    for (const r of actOverdue) actInit(r.actionId!).overdue = (r._count as any)._all
    const openActionStates = ['draft', 'in_progress', 'on_hold', 'at_risk']
    const byAction = actions.map((a) => {
      const t = actAgg[a.id] ?? { total: 0, done: 0, overdue: 0 }
      return {
        actionId: a.id, title: a.title, status: a.status, deadline: a.deadline, period: a.period,
        createdAt: a.createdAt, orgUnitId: a.orgUnit?.id, orgUnitName: a.orgUnit?.name ?? '—',
        legalEntity: a.orgUnit?.legalEntity ?? null, ownerName: a.owner?.displayName ?? '—',
        taskTotal: t.total, taskDone: t.done, taskOpen: t.total - t.done, taskOverdue: t.overdue,
        taskCompletionRate: rate(t.done, t.total),
        overdue: !!(a.deadline && a.deadline < now && openActionStates.includes(a.status)),
      }
    })
    const actionStats = {
      total: byAction.length,
      byStatus: byAction.reduce((m: Record<string, number>, a) => { m[a.status] = (m[a.status] || 0) + 1; return m }, {}),
      overdue: byAction.filter((a) => a.overdue).length,
      withoutTask: byAction.filter((a) => a.taskTotal === 0).length,
      taskTotal: byAction.reduce((s, a) => s + a.taskTotal, 0),
      taskDone: byAction.reduce((s, a) => s + a.taskDone, 0),
      taskOverdue: byAction.reduce((s, a) => s + a.taskOverdue, 0),
    }

    // ── Top người thực hiện ──
    const [openByUser, overdueByUser] = await Promise.all([
      this.prisma.task.groupBy({ by: ['assigneeId'], where: { ...where, status: { not: 'done' } }, _count: { _all: true } }),
      this.prisma.task.groupBy({ by: ['assigneeId'], where: { ...where, ...bucketWhere('overdue', now) }, _count: { _all: true } }),
    ])
    const overdueMap = new Map(overdueByUser.map((r) => [r.assigneeId, (r._count as any)._all]))
    const topIds = openByUser
      .map((r) => ({ userId: r.assigneeId, open: (r._count as any)._all, overdue: overdueMap.get(r.assigneeId) ?? 0 }))
      .sort((a, b) => b.open - a.open)
      .slice(0, 10)
    const topUsers = await this.prisma.user.findMany({
      where: { id: { in: topIds.map((t) => t.userId) } },
      select: { id: true, displayName: true, avatarUrl: true },
    })
    const userById2 = new Map(topUsers.map((u) => [u.id, u]))
    const topAssignees = topIds.map((t) => ({ ...t, user: userById2.get(t.userId) ?? null }))

    return {
      generatedAt: now,
      range: { from: f.from ?? null, to: f.to ?? null, basis: 'Tập chính theo createdAt · hoàn thành trong kỳ theo completedAt · quá hạn/sắp hạn tính tại hiện tại' },
      scope: { orgUnitCount: f.orgUnitIds.length, filteredOrgUnitId: q.orgUnitId ?? null },
      task: {
        total, byStatus, active, overdue, dueSoon, dueSoonDays: DUE_SOON_DAYS,
        withProject, withAction, withoutProject: total - withProject, withoutAction: total - withAction,
        completedInRange, completionRate: rate(byStatus.done, total), overdueRate: rate(overdue, active),
      },
      trend,
      byOrgUnit,
      actionStats,
      byAction,
      topAssignees,
    }
  }

  /** Drill-down danh sách task nguồn — CÙNG where-builder với overview → khớp số. */
  async drillTasks(me: Me, q: any) {
    const f = await this.resolveFilters(me, q)
    const now = new Date()
    const bucket = q.bucket || 'all'
    const where: any = { ...taskBaseWhere(f), ...bucketWhere(bucket, now) }
    if (bucket === 'completedInRange' && (f.from || f.to)) {
      delete where.createdAt
      where.completedAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) }
    }
    const page = Math.max(1, Number(q.page) || 1)
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 20, 1), DRILL_PAGE_SIZE_MAX)
    const [total, rows] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, title: true, status: true, dueDate: true, priority: true,
          projectId: true, actionId: true, completedAt: true,
          orgUnit: { select: { name: true, legalEntity: true } },
          action: { select: { title: true } },
          assignee: { select: { id: true, displayName: true, avatarUrl: true } },
          reviewer: { select: { id: true, displayName: true } },
          workspace: { select: { type: true, name: true } },
        },
      }),
    ])
    return {
      total, page, pageSize, bucket,
      rows: rows.map((t) => ({
        id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, priority: t.priority,
        orgUnitName: t.orgUnit?.name ?? '—', legalEntity: t.orgUnit?.legalEntity ?? null,
        projectName: t.projectId ? ((t.workspace?.type === 'project' ? t.workspace?.name : null) ?? '(dự án)') : null,
        actionTitle: t.action?.title ?? null,
        assignee: t.assignee ? { id: t.assignee.id, displayName: t.assignee.displayName, avatarUrl: t.assignee.avatarUrl } : null,
        reviewerName: t.reviewer?.displayName ?? null,
        overdue: !!(t.dueDate && t.dueDate < now && t.status !== 'done'),
        completedAt: t.completedAt,
      })),
    }
  }

}
