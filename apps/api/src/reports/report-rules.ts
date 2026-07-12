import { BadRequestException } from '@nestjs/common'

/**
 * P1-1 — QUY TẮC SỐ LIỆU BÁO CÁO (định nghĩa TẬP TRUNG, mọi màn hình dùng chung).
 *
 * Chiều thời gian (chốt theo spec E):
 *  - Tập task chính của kỳ  : createdAt ∈ [from, to]   (task PHÁT SINH trong kỳ)
 *  - Task hoàn thành trong kỳ: completedAt ∈ [from, to] (chỉ số riêng, không đổi tập chính)
 *  - Quá hạn / sắp đến hạn  : tính tại THỜI ĐIỂM HIỆN TẠI trên tập đã lọc
 *  - Action trong kỳ        : createdAt ∈ [from, to] HOẶC period (yyyy-MM) thuộc kỳ
 *  - Không truyền from/to   : toàn bộ dữ liệu trong phạm vi quyền
 *
 * Định nghĩa:
 *  - active      : status ≠ done (task không có trạng thái cancelled)
 *  - overdue     : dueDate < now AND status ≠ done
 *  - dueSoon     : status ≠ done AND now ≤ dueDate ≤ now + DUE_SOON_DAYS
 *  - completed   : status = done
 *  - waitingReview: status = submitted (KHÔNG dùng reviewRequired đơn thuần)
 *  - completionRate = done/total (total=0 → 0, không NaN)
 *  - lateOnDay(d): task đến hạn ngày d và trễ (done sau hạn, hoặc chưa done mà đã quá hạn)
 *  - Action overdue: deadline < now AND status ∉ {done, cancelled}; không deadline → không overdue
 *  - Action completion: hiển thị CẢ trạng thái Action LẪN tỷ lệ task done — không tự đánh
 *    dấu Action done khi task xong hết (nghiệp vụ không quy định).
 *  - Org unit: group theo Task.orgUnitId — MỘT task đếm đúng MỘT lần trong một đơn vị;
 *    task đồng thời có project/action vẫn chỉ 1 dòng trong DB nên tổng toàn phạm vi không trùng.
 *  - Task thiếu orgUnitId (legacy hiếm): KHÔNG vào aggregate theo đơn vị (ghi chú UI).
 *
 * KHÔNG PHẢI KPI — chỉ là thống kê vận hành.
 */
export const DUE_SOON_DAYS = 3
export const DRILL_PAGE_SIZE_MAX = 50
export const TREND_DEFAULT_DAYS = 30

export const TASK_STATUSES = ['todo', 'doing', 'waiting', 'submitted', 'returned', 'done', 'paused'] as const
export const DRILL_BUCKETS = [
  'all', 'todo', 'doing', 'waiting', 'submitted', 'returned', 'done', 'paused',
  'overdue', 'dueSoon', 'active', 'withProject', 'withAction', 'noProject', 'noAction',
  'completedInRange',
] as const

export interface ReportFilters {
  from?: Date
  to?: Date
  orgUnitIds: string[] // ĐÃ được server giao với scope — không tin client
  projectId?: string
  actionId?: string // 'none' = task không thuộc Action
  assigneeId?: string
  status?: string
}

export function parseRange(from?: string, to?: string): { from?: Date; to?: Date } {
  const parse = (v: string | undefined, label: string) => {
    if (!v) return undefined
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`Tham số ${label} không hợp lệ`)
    return d
  }
  const f = parse(from, 'from')
  let t = parse(to, 'to')
  if (t) t = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59, 999) // trọn ngày
  if (f && t && f > t) throw new BadRequestException('Khoảng thời gian không hợp lệ (from > to)')
  return { from: f, to: t }
}

/** Where TASK dùng chung cho MỌI chỉ số + drill-down (đảm bảo khớp số tuyệt đối). */
export function taskBaseWhere(f: ReportFilters): any {
  const where: any = { archived: false, orgUnitId: { in: f.orgUnitIds } }
  if (f.from || f.to) {
    where.createdAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) }
  }
  if (f.projectId) where.projectId = f.projectId
  if (f.actionId === 'none') where.actionId = null
  else if (f.actionId) where.actionId = f.actionId
  if (f.assigneeId) where.assigneeId = f.assigneeId
  if (f.status) where.status = f.status
  return where
}

/** Where bổ sung theo bucket drill-down — CÙNG định nghĩa với overview. */
export function bucketWhere(bucket: string, now = new Date()): any {
  const soon = new Date(now.getTime() + DUE_SOON_DAYS * 86400000)
  switch (bucket) {
    case 'all': return {}
    case 'active': return { status: { not: 'done' } }
    case 'overdue': return { status: { not: 'done' }, dueDate: { lt: now } }
    case 'dueSoon': return { status: { not: 'done' }, dueDate: { gte: now, lte: soon } }
    case 'withProject': return { projectId: { not: null } }
    case 'withAction': return { actionId: { not: null } }
    case 'noProject': return { projectId: null }
    case 'noAction': return { actionId: null }
    case 'completedInRange': return { status: 'done' } // range completedAt xử lý ở service
    default:
      if ((TASK_STATUSES as readonly string[]).includes(bucket)) return { status: bucket }
      throw new BadRequestException('bucket không hợp lệ')
  }
}

/** Where ACTION trong kỳ: createdAt ∈ kỳ HOẶC period (yyyy-MM) thuộc kỳ. */
export function actionBaseWhere(f: ReportFilters): any {
  const where: any = { archived: false, orgUnitId: { in: f.orgUnitIds } }
  if (f.from || f.to) {
    const periods = monthsBetween(f.from, f.to)
    where.OR = [
      { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } },
      ...(periods.length ? [{ period: { in: periods } }] : []),
    ]
  }
  return where
}

export function monthsBetween(from?: Date, to?: Date): string[] {
  if (!from || !to) return []
  const out: string[] = []
  const d = new Date(from.getFullYear(), from.getMonth(), 1)
  while (d <= to && out.length < 60) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() + 1)
  }
  return out
}

export const rate = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0)
