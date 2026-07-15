/**
 * P1-6 (phương án A): đọc CSV export Asana để lấy map Task ID → Assignee Email.
 * Ghép với JSON (giữ cây việc con) theo Task ID → map người theo EMAIL (chuẩn hơn tên).
 * Pure (không DB). Parser RFC4180: quote, "" escape, xuống dòng/nháy trong ô.
 */
import { IMPORT_LIMITS } from './import.constants'

export function parseCsv(text: string): string[][] {
  if (typeof text !== 'string') return []
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // BOM
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inq = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inq) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else inq = false } else cur += c
      continue
    }
    if (c === '"') inq = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows
}

/** Task ID (gid) → Assignee Email. Trả {} nếu CSV không đúng định dạng Asana. */
export function csvTaskEmails(rawCsv: string): Record<string, string> {
  if (typeof rawCsv !== 'string' || rawCsv.trim() === '') return {}
  if (Buffer.byteLength(rawCsv, 'utf8') > IMPORT_LIMITS.MAX_RAW_BYTES) return {}
  const rows = parseCsv(rawCsv)
  if (rows.length < 2) return {}
  const H = rows[0].map((h) => h.trim())
  const cId = H.indexOf('Task ID')
  const cEmail = H.indexOf('Assignee Email')
  if (cId < 0 || cEmail < 0) return {}
  const out: Record<string, string> = {}
  for (let i = 1; i < rows.length; i++) {
    const gid = (rows[i][cId] || '').trim()
    const email = (rows[i][cEmail] || '').trim()
    if (gid && email && gid !== '__proto__') out[gid] = email
  }
  return out
}
