// FEATURE-004: hiển thị đơn vị tổ chức THỐNG NHẤT toàn app.
// Nhiều đơn vị trùng tên giữa các pháp nhân (VD 3 "Ban Điều Hành": Hạ Long /
// Đông Mai / khối Group) → mọi dropdown/picker/filter PHẢI kèm pháp nhân + mã.

export const LEGAL_ENTITY = {
  HALONG: 'Hạ Long',
  DONGMAI: 'Đông Mai',
  GROUP: 'Group',
  HOPNHAT: 'Hợp nhất',
}

export const ORG_TYPE = {
  company: 'Công ty',
  block: 'Khối',
  department: 'Phòng/ban',
}

export const legalEntityLabel = (le) => (le ? LEGAL_ENTITY[le] || le : '')

/** Nhãn đầy đủ cho dropdown/picker: "Ban Điều Hành (Hạ Long) — BDH-HALONG" */
export function orgUnitLabel(o) {
  if (!o) return '—'
  const entity = legalEntityLabel(o.legalEntity)
  return `${o.name}${entity ? ` (${entity})` : ''}${o.code ? ` — ${o.code}` : ''}`
}

/** Nhãn ngắn khi ngữ cảnh đã rõ: "Ban Điều Hành (Hạ Long)" */
export function orgUnitShortLabel(o) {
  if (!o) return '—'
  const entity = legalEntityLabel(o.legalEntity)
  return `${o.name}${entity ? ` (${entity})` : ''}`
}

/**
 * Tên hiển thị trong danh sách (sidebar/menu/thẻ): giữ tên gọn, CHỈ kèm pháp nhân
 * khi trong danh sách có đơn vị khác TRÙNG TÊN (VD 2 "Ban Điều Hành" HALONG/DONGMAI).
 */
export function orgUnitDisplayName(o, list = []) {
  if (!o) return '—'
  const dup = list.some((x) => x.id !== o.id && x.name === o.name)
  return dup ? orgUnitShortLabel(o) : o.name
}
