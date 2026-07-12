/**
 * P1-3 — REMINDER ENGINE: quy tắc & mốc nhắc (pure logic, unit-test được).
 *
 * Múi giờ: mọi phép tính "ngày" theo REMINDER_TIMEZONE (mặc định Asia/Bangkok,
 * không DST). "Hôm nay" = dayKey(now, tz) dạng YYYY-MM-DD.
 *
 * Mốc nhắc (stage) — dedupeKey chứa stage (+ mốc hạn với rule theo deadline nên
 * ĐỔI DEADLINE ⇒ key mới ⇒ tính lại đúng, không dùng nhầm reminder cũ):
 *  - TASK_DUE_SOON  : D3 (trước 3 ngày), D1 (trước 1 ngày), D0 (trong ngày đến hạn)
 *  - TASK_OVERDUE   : OD1, OD3, OD7, sau đó mỗi 7 ngày (OD14, OD21…) — không spam hằng ngày
 *  - TASK_NOT_STARTED: NS (sau N ngày tạo mà vẫn todo, mặc định 2) + NS7 (sau 7 ngày) — mỗi mốc 1 lần
 *  - TASK_WAITING_REVIEW: W1, W3, sau đó mỗi 3 ngày (W6, W9…) — tính từ lúc NỘP nghiệm thu
 *  - TASK_RETURNED  : R1, R3, sau đó mỗi 3 ngày — tính từ lúc bị trả lại
 *  - ACTION_DUE_SOON: AD3, AD1, AD0
 *  - ACTION_OVERDUE : AOD1, AOD7, sau đó mỗi 7 ngày (tần suất thấp hơn task)
 *  - ACTION_EMPTY   : AE (sau N ngày tạo chưa có task, mặc định 2) + AE7 — mỗi mốc 1 lần
 *
 * Loại trừ: task done/paused (paused = chủ động tạm dừng, nhắc là spam);
 * task submitted KHÔNG tính overdue (đã nộp — thuộc rule WAITING_REVIEW);
 * user inactive; task/action archived; task không dueDate (với rule theo hạn).
 * Escalation tầng 3 (quản lý theo scope) KHÔNG làm ở phiên này → backlog P1-5.
 */

export interface ReminderConfig {
  enabled: boolean
  intervalMinutes: number
  timezone: string
  dueSoonDays: number
  notStartedDays: number
  reviewWaitDays: number
  returnedWaitDays: number
}

/**
 * P1-4 — metadata từng field config: default trong code, env fallback, giới hạn an toàn.
 * actionEmptyDays DÙNG CHUNG notStartedDays (UI ghi rõ — không tách config khi chưa cần).
 */
export const CONFIG_FIELDS = {
  enabled: { env: 'REMINDER_ENGINE_ENABLED', def: false, type: 'boolean' as const, label: 'Bật Reminder Engine' },
  intervalMinutes: { env: 'REMINDER_INTERVAL_MINUTES', def: 30, min: 5, max: 1440, type: 'int' as const, label: 'Chu kỳ chạy (phút)' },
  timezone: { env: 'REMINDER_TIMEZONE', def: 'Asia/Bangkok', type: 'tz' as const, allowed: ['Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'UTC'], label: 'Múi giờ' },
  dueSoonDays: { env: 'REMINDER_DUE_SOON_DAYS', def: 3, min: 1, max: 14, type: 'int' as const, label: 'Ngưỡng sắp đến hạn (ngày)' },
  notStartedDays: { env: 'REMINDER_NOT_STARTED_DAYS', def: 2, min: 1, max: 30, type: 'int' as const, label: 'Ngưỡng chưa bắt đầu / Action trống (ngày)' },
  reviewWaitDays: { env: 'REMINDER_REVIEW_WAIT_DAYS', def: 1, min: 1, max: 30, type: 'int' as const, label: 'Ngưỡng chờ nghiệm thu (ngày)' },
  returnedWaitDays: { env: 'REMINDER_RETURNED_WAIT_DAYS', def: 1, min: 1, max: 30, type: 'int' as const, label: 'Ngưỡng bị trả lại (ngày)' },
} as const
export type ConfigKey = keyof typeof CONFIG_FIELDS

function envValueOf(key: ConfigKey): unknown {
  const meta = CONFIG_FIELDS[key]
  const raw = process.env[meta.env]
  if (raw === undefined || raw === '') return undefined
  if (meta.type === 'boolean') return raw === 'true'
  if (meta.type === 'int') {
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
  }
  return raw
}

/** Resolve config hiệu lực: DB override > env > default. Trả kèm nguồn từng field. */
export function resolveConfig(dbOverrides: Record<string, unknown> | null | undefined): {
  cfg: ReminderConfig
  sources: Record<ConfigKey, 'database' | 'env' | 'default'>
} {
  const cfg: any = {}
  const sources: any = {}
  for (const key of Object.keys(CONFIG_FIELDS) as ConfigKey[]) {
    const meta = CONFIG_FIELDS[key]
    const db = dbOverrides?.[key]
    const env = envValueOf(key)
    if (db !== undefined && db !== null) { cfg[key] = db; sources[key] = 'database' }
    else if (env !== undefined) { cfg[key] = env; sources[key] = 'env' }
    else { cfg[key] = meta.def; sources[key] = 'default' }
  }
  return { cfg, sources }
}

export function loadReminderConfig(): ReminderConfig {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : d
  }
  return {
    enabled: process.env.REMINDER_ENGINE_ENABLED === 'true', // mặc định OFF
    intervalMinutes: num(process.env.REMINDER_INTERVAL_MINUTES, 30),
    timezone: process.env.REMINDER_TIMEZONE || 'Asia/Bangkok',
    dueSoonDays: num(process.env.REMINDER_DUE_SOON_DAYS, 3),
    notStartedDays: num(process.env.REMINDER_NOT_STARTED_DAYS, 2),
    reviewWaitDays: num(process.env.REMINDER_REVIEW_WAIT_DAYS, 1),
    returnedWaitDays: num(process.env.REMINDER_RETURNED_WAIT_DAYS, 1),
  }
}

/** YYYY-MM-DD của một thời điểm theo múi giờ cấu hình. */
export function dayKey(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Số ngày nguyên giữa 2 dayKey (a - b). */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000)
}

/** Mốc TASK_DUE_SOON theo số ngày còn lại (0..3). */
export function dueSoonStage(daysLeft: number): string | null {
  if (daysLeft === 3) return 'D3'
  if (daysLeft === 1) return 'D1'
  if (daysLeft === 0) return 'D0'
  return null
}

/** Mốc TASK_OVERDUE theo số ngày đã quá hạn (≥1). */
export function overdueStage(d: number): string | null {
  if (d === 1) return 'OD1'
  if (d === 3) return 'OD3'
  if (d === 7) return 'OD7'
  if (d > 7 && d % 7 === 0) return `OD${d}`
  return null
}

/** Mốc chờ (nghiệm thu / trả lại): 1, 3, sau đó mỗi 3 ngày. */
export function waitStage(d: number, prefix: string): string | null {
  if (d === 1) return `${prefix}1`
  if (d === 3) return `${prefix}3`
  if (d > 3 && d % 3 === 0) return `${prefix}${d}`
  return null
}

/** Mốc ACTION_OVERDUE: 1, 7, sau đó mỗi 7 ngày. */
export function actionOverdueStage(d: number): string | null {
  if (d === 1) return 'AOD1'
  if (d === 7) return 'AOD7'
  if (d > 7 && d % 7 === 0) return `AOD${d}`
  return null
}

/** Trạng thái task còn "đang chạy" (được nhắc theo hạn). */
export const TASK_ACTIVE_STATUSES = ['todo', 'doing', 'waiting', 'returned'] as const
/** Trạng thái action còn mở. */
export const ACTION_OPEN_STATUSES = ['draft', 'in_progress', 'on_hold', 'at_risk'] as const
