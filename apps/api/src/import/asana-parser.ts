/**
 * P1-6 — Parse + validate Asana JSON THÔ (pure, không phụ thuộc Nest/Prisma → test được).
 *
 * An toàn (spec N): JSON.parse thuần (không eval), giới hạn kích thước, chặn
 * prototype-pollution (bỏ key __proto__/constructor/prototype khi đọc), chỉ đọc
 * các field đã biết (không dùng key JSON làm object-path). Root phải là { data: [...] }.
 */
import { IMPORT_LIMITS } from './import.constants'

export type ImportErrorCode =
  | 'EMPTY'
  | 'TOO_LARGE'
  | 'INVALID_JSON'
  | 'NOT_OBJECT'
  | 'NO_DATA_ARRAY'
  | 'TOO_MANY_ENTITIES'

export class ImportParseError extends Error {
  constructor(public code: ImportErrorCode, message: string) {
    super(message)
    this.name = 'ImportParseError'
  }
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** Loại bỏ đệ quy các key nguy hiểm (phòng prototype pollution khi merge/sao chép sau). */
function stripDangerousKeys(value: unknown, depth = 0): unknown {
  if (depth > IMPORT_LIMITS.MAX_DEPTH) return null
  if (Array.isArray(value)) return value.map((v) => stripDangerousKeys(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(k)) continue
      out[k] = stripDangerousKeys(v, depth + 1)
    }
    return out
  }
  return value
}

export interface ParsedAsana {
  data: any[]
  rawBytes: number
}

/**
 * Parse chuỗi JSON Asana → mảng data đã làm sạch. Ném ImportParseError (controller → 400).
 * KHÔNG ghi DB. KHÔNG fetch URL.
 */
export function parseAsanaJson(raw: string): ParsedAsana {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ImportParseError('EMPTY', 'Chưa có dữ liệu JSON.')
  }
  const rawBytes = Buffer.byteLength(raw, 'utf8')
  if (rawBytes > IMPORT_LIMITS.MAX_RAW_BYTES) {
    throw new ImportParseError('TOO_LARGE', `File quá lớn (${Math.round(rawBytes / 1024)}KB > ${IMPORT_LIMITS.MAX_RAW_BYTES / 1024 / 1024}MB).`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ImportParseError('INVALID_JSON', 'JSON không hợp lệ — kiểm tra lại nội dung export.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ImportParseError('NOT_OBJECT', 'Root JSON phải là object dạng { data: [...] }.')
  }
  const clean = stripDangerousKeys(parsed) as Record<string, unknown>
  const data = clean.data
  if (!Array.isArray(data)) {
    throw new ImportParseError('NO_DATA_ARRAY', 'Root JSON thiếu mảng "data" (không đúng định dạng Asana export).')
  }
  // Ước lượng nhanh số entity (root + subtasks nông) để chặn sớm file khổng lồ.
  if (data.length > IMPORT_LIMITS.MAX_ENTITIES) {
    throw new ImportParseError('TOO_MANY_ENTITIES', `Quá nhiều mục (${data.length} > ${IMPORT_LIMITS.MAX_ENTITIES}).`)
  }
  return { data, rawBytes }
}
