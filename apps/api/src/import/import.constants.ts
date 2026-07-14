/**
 * P1-6 — Import Asana JSON: giới hạn an toàn (spec M) + hằng số dùng chung.
 * Đặt tập trung để parser/normalizer/service/test cùng một nguồn.
 */
export const IMPORT_LIMITS = {
  MAX_RAW_BYTES: 25 * 1024 * 1024, // 25MB chuỗi JSON thô — vượt → 400 (body limit main.ts = 30MB)
  MAX_ENTITIES: 20000, // tổng task+subtask unique — vượt → từ chối
  MAX_DEPTH: 20, // độ sâu cây tối đa quét (chống JSON lồng vô hạn)
  MAX_TITLE: 255, // khớp Task.title @MaxLength(255) — dài hơn → cắt + warning
  MAX_NOTES: 20000, // cắt mô tả quá dài
  EXECUTE_CHUNK: 200, // số task/chunk khi ghi thật (tránh transaction quá lớn)
} as const

export const IMPORT_SOURCE = 'asana'

// Trạng thái task import: CHỈ suy từ completed (spec D3). Không suy doing/waiting/...
export type ImportTaskStatus = 'todo' | 'done'

/**
 * Map giá trị custom field "Priority" (EN + VI) → enum app.
 * Giá trị lạ → normal + warning (spec: "giá trị khác → default NORMAL + warning").
 */
export function mapPriority(raw: string | null | undefined): { value: 'low' | 'normal' | 'high' | 'urgent'; unknown: boolean } {
  const v = (raw || '').trim().toLowerCase()
  if (!v) return { value: 'normal', unknown: false }
  if (/(^|\b)(low|thấp|thap)\b/.test(v)) return { value: 'low', unknown: false }
  if (/(^|\b)(medium|normal|trung bình|trung binh|tb)\b/.test(v)) return { value: 'normal', unknown: false }
  if (/(^|\b)(high|cao)\b/.test(v)) return { value: 'high', unknown: false }
  if (/(^|\b)(urgent|khẩn|khan|gấp|gap)\b/.test(v)) return { value: 'urgent', unknown: false }
  return { value: 'normal', unknown: true }
}

export const APP_TASK_SECTIONS = ['suvu', 'kehoach', 'hangngay', 'phatsinh'] as const
export type AppTaskSection = (typeof APP_TASK_SECTIONS)[number]
