/**
 * P1-6 — Chuẩn hoá dữ liệu Asana đã parse (pure, test được).
 *
 * Nhiệm vụ:
 *  - Flatten toàn bộ cây (root data[] + subtasks[] lồng nhau, mọi cấp).
 *  - DEDUPE theo gid (KHÔNG bao giờ theo title). Cùng gid xuất hiện nhiều nơi
 *    (root + nested) → gộp 1 lần, chọn payload ĐẦY ĐỦ hơn (deterministic).
 *  - Giữ quan hệ parent (ưu tiên parent.gid tường minh, fallback vị trí lồng).
 *  - Tổng hợp danh sách project, user, custom field (để UI ghép/ánh xạ).
 *  - Sinh summary + warnings; KHÔNG quyết định task-vs-subtask (việc của planner).
 */
import { IMPORT_LIMITS } from './import.constants'

export interface NormalizedTask {
  gid: string
  title: string
  titleEmpty: boolean
  description: string
  completed: boolean
  completedAt: string | null // ISO
  sourceCreatedAt: string | null // ISO (created_at Asana)
  startOn: string | null // yyyy-mm-dd
  dueOn: string | null // yyyy-mm-dd
  startInvalid: boolean
  dueInvalid: boolean
  assigneeGid: string | null
  assigneeName: string | null
  followerGids: string[]
  parentGid: string | null
  projectGids: string[]
  sections: string[] // tên section (mọi project) — để map thủ công
  sectionByProject: Record<string, string> // projectGid → tên section trong project đó
  permalink: string | null
  tags: string[]
  customFieldValues: Record<string, string> // fieldGid → display value
  occurrences: number // số bản trùng gid đã gộp
  conflict: boolean // các bản trùng có khác nhau ở field lõi
}

export interface NormalizedProject {
  gid: string
  name: string
  taskCount: number
}
export interface NormalizedUser {
  gid: string
  name: string
  count: number
  email?: string | null // từ CSV (ghép theo Task ID) — để map người chuẩn
  suggestedUserId?: string | null // app user khớp email (service điền)
  suggestedBy?: 'email' | null
}
export interface NormalizedCustomField {
  gid: string
  name: string
  type: string
  valueCount: number
  looksLikePriority: boolean
}
export interface NormalizedSection {
  name: string
  count: number
}

export interface NormalizeSummary {
  rootTasks: number
  subtasks: number
  uniqueEntities: number
  duplicateGids: number
  completedCount: number
  notCompletedCount: number
  missingAssignee: number
  emptyTitle: number
  projects: number
  users: number
  warnings: number
  maxDepthSeen: number
  truncatedDepth: boolean
}

export interface NormalizeResult {
  tasks: NormalizedTask[]
  projects: NormalizedProject[]
  users: NormalizedUser[]
  customFields: NormalizedCustomField[]
  sections: NormalizedSection[]
  sectionsByProject: Record<string, NormalizedSection[]> // projectGid → sections trong project đó
  summary: NormalizeSummary
  warnings: string[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const PRIORITY_NAME_RE = /priority|ưu tiên|uu tien|độ ưu|do uu/i

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const gidOf = (v: any): string | null => (v && typeof v === 'object' && typeof v.gid === 'string' && v.gid ? v.gid : null)

function isoOrNull(v: unknown): { iso: string | null; invalid: boolean } {
  const s = str(v).trim()
  if (!s) return { iso: null, invalid: false }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return { iso: null, invalid: true }
  return { iso: d.toISOString(), invalid: false }
}

function dateOnlyOrNull(v: unknown): { date: string | null; invalid: boolean } {
  const s = str(v).trim()
  if (!s) return { date: null, invalid: false }
  if (!DATE_RE.test(s)) {
    // Asana đôi khi để due_at ISO thay due_on — thử lấy phần ngày
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return { date: d.toISOString().slice(0, 10), invalid: false }
    return { date: null, invalid: true }
  }
  const d = new Date(s + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return { date: null, invalid: true }
  return { date: s, invalid: false }
}

function customFieldValue(cf: any): string | null {
  if (!cf || typeof cf !== 'object') return null
  if (typeof cf.display_value === 'string' && cf.display_value !== '') return cf.display_value
  if (cf.enum_value && typeof cf.enum_value === 'object' && typeof cf.enum_value.name === 'string') return cf.enum_value.name
  if (typeof cf.text_value === 'string' && cf.text_value !== '') return cf.text_value
  if (cf.number_value !== null && cf.number_value !== undefined) return String(cf.number_value)
  return null
}

/** Điểm "đầy đủ" của 1 payload — chọn bản cao điểm khi gộp trùng gid. */
function completeness(raw: any): number {
  let s = 0
  if (str(raw.name).trim()) s++
  if (str(raw.notes).trim()) s++
  if (gidOf(raw.assignee)) s++
  if (raw.completed_at) s++
  if (raw.due_on || raw.due_at) s++
  if (raw.start_on || raw.start_at) s++
  if (Array.isArray(raw.subtasks) && raw.subtasks.length) s += 2
  if (Array.isArray(raw.followers) && raw.followers.length) s++
  if (Array.isArray(raw.projects) && raw.projects.length) s++
  if (Array.isArray(raw.memberships) && raw.memberships.length) s++
  if (Array.isArray(raw.custom_fields) && raw.custom_fields.length) s++
  return s
}

function coreSignature(raw: any): string {
  return JSON.stringify([str(raw.name).trim(), str(raw.notes).trim(), gidOf(raw.assignee), !!raw.completed, raw.due_on || raw.due_at || null])
}

/** Flatten cây, thu THÔ mọi lần xuất hiện theo gid (kèm parent suy từ vị trí lồng). */
function collect(
  data: any[],
  onSeen: (raw: any, nestedParentGid: string | null, depth: number) => void,
  state: { maxDepthSeen: number; truncatedDepth: boolean },
): void {
  const walk = (node: any, nestedParentGid: string | null, depth: number) => {
    if (!node || typeof node !== 'object') return
    if (depth > IMPORT_LIMITS.MAX_DEPTH) {
      state.truncatedDepth = true
      return
    }
    state.maxDepthSeen = Math.max(state.maxDepthSeen, depth)
    const gid = typeof node.gid === 'string' ? node.gid : null
    if (!gid) return
    onSeen(node, nestedParentGid, depth)
    if (Array.isArray(node.subtasks)) {
      for (const child of node.subtasks) walk(child, gid, depth + 1)
    }
  }
  for (const top of data) walk(top, null, 0)
}

export function normalize(data: any[]): NormalizeResult {
  const warnings: string[] = []
  const state = { maxDepthSeen: 0, truncatedDepth: false }

  // Gom mọi lần xuất hiện theo gid.
  const byGid = new Map<string, { best: any; bestScore: number; nestedParent: string | null; count: number; conflict: boolean; sig: string }>()
  collect(
    data,
    (raw, nestedParentGid, _depth) => {
      const gid: string = raw.gid
      const score = completeness(raw)
      const sig = coreSignature(raw)
      const prev = byGid.get(gid)
      if (!prev) {
        byGid.set(gid, { best: raw, bestScore: score, nestedParent: nestedParentGid, count: 1, conflict: false, sig })
        return
      }
      prev.count++
      if (prev.sig !== sig) prev.conflict = true
      // giữ nestedParent nếu bản trước null mà bản này có (subtask lồng cho biết cha)
      if (!prev.nestedParent && nestedParentGid) prev.nestedParent = nestedParentGid
      if (score > prev.bestScore) {
        prev.best = raw
        prev.bestScore = score
      }
    },
    state,
  )

  if (state.truncatedDepth) warnings.push(`Cây lồng vượt ${IMPORT_LIMITS.MAX_DEPTH} cấp — các cấp sâu hơn bị bỏ qua.`)
  if (byGid.size > IMPORT_LIMITS.MAX_ENTITIES) {
    // Chặn cứng (parser đã chặn theo data.length; đây là chặn sau khi flatten subtasks).
    throw Object.assign(new Error(`Quá nhiều mục sau khi flatten (${byGid.size} > ${IMPORT_LIMITS.MAX_ENTITIES}).`), { code: 'TOO_MANY_ENTITIES' })
  }

  const tasks: NormalizedTask[] = []
  const projMap = new Map<string, NormalizedProject>()
  const userMap = new Map<string, NormalizedUser>()
  const cfMap = new Map<string, NormalizedCustomField>()
  const sectMap = new Map<string, NormalizedSection>()
  const sectByProjMap = new Map<string, Map<string, number>>() // projectGid → (sectionName → count)

  const bumpUser = (u: any) => {
    const gid = gidOf(u)
    if (!gid) return
    const cur = userMap.get(gid)
    if (cur) cur.count++
    else userMap.set(gid, { gid, name: str(u.name) || '(không tên)', count: 1 })
  }
  const bumpProject = (p: any) => {
    const gid = gidOf(p)
    if (!gid) return null
    const cur = projMap.get(gid)
    if (cur) cur.taskCount++
    else projMap.set(gid, { gid, name: str(p.name) || '(dự án không tên)', taskCount: 1 })
    return gid
  }

  let rootTasks = 0
  let subtasks = 0
  let duplicateGids = 0
  let completedCount = 0
  let missingAssignee = 0
  let emptyTitle = 0

  for (const [gid, agg] of byGid) {
    const raw = agg.best
    if (agg.count > 1) duplicateGids++
    if (agg.conflict) warnings.push(`gid ${gid}: các bản trùng có nội dung khác nhau — đã chọn bản đầy đủ hơn.`)

    // parent: ưu tiên parent.gid tường minh, fallback vị trí lồng
    const explicitParent = gidOf(raw.parent)
    const parentGid = explicitParent || agg.nestedParent || null

    const rawTitle = str(raw.name).trim()
    const titleEmpty = rawTitle === ''
    let title = rawTitle
    if (title.length > IMPORT_LIMITS.MAX_TITLE) {
      title = title.slice(0, IMPORT_LIMITS.MAX_TITLE)
      warnings.push(`gid ${gid}: tiêu đề dài quá ${IMPORT_LIMITS.MAX_TITLE} ký tự — đã cắt.`)
    }
    if (titleEmpty) emptyTitle++

    let description = str(raw.notes)
    if (description.length > IMPORT_LIMITS.MAX_NOTES) description = description.slice(0, IMPORT_LIMITS.MAX_NOTES)

    const completed = raw.completed === true
    if (completed) completedCount++
    const completedAt = isoOrNull(raw.completed_at)
    const created = isoOrNull(raw.created_at)
    const start = dateOnlyOrNull(raw.start_on ?? raw.start_at)
    const due = dateOnlyOrNull(raw.due_on ?? raw.due_at)
    if (start.invalid) warnings.push(`gid ${gid}: start_on không hợp lệ — bỏ qua ngày bắt đầu.`)
    if (due.invalid) warnings.push(`gid ${gid}: due_on không hợp lệ — bỏ qua hạn.`)

    const assignee = raw.assignee
    const assigneeGid = gidOf(assignee)
    if (assignee) bumpUser(assignee)
    if (!assigneeGid) missingAssignee++

    const followerGids: string[] = []
    if (Array.isArray(raw.followers)) {
      for (const f of raw.followers) {
        const fg = gidOf(f)
        if (fg) {
          followerGids.push(fg)
          bumpUser(f)
        }
      }
    }

    // projects: projects[] + memberships[].project ; sections từ memberships[].section
    const projectGids = new Set<string>()
    const sections = new Set<string>()
    const sectionByProject: Record<string, string> = {}
    if (Array.isArray(raw.projects)) for (const p of raw.projects) {
      const pg = bumpProject(p)
      if (pg) projectGids.add(pg)
    }
    if (Array.isArray(raw.memberships)) for (const m of raw.memberships) {
      if (m && typeof m === 'object') {
        const pg = bumpProject(m.project)
        if (pg) projectGids.add(pg)
        const sName = m.section && typeof m.section === 'object' ? str(m.section.name).trim() : ''
        if (sName) {
          sections.add(sName)
          const cur = sectMap.get(sName)
          if (cur) cur.count++
          else sectMap.set(sName, { name: sName, count: 1 })
          if (pg) {
            sectionByProject[pg] = sName // section của task TRONG project pg
            let pm = sectByProjMap.get(pg)
            if (!pm) { pm = new Map(); sectByProjMap.set(pg, pm) }
            pm.set(sName, (pm.get(sName) || 0) + 1)
          }
        }
      }
    }

    // custom fields → giá trị hiển thị + gom định nghĩa theo gid
    const customFieldValues: Record<string, string> = {}
    if (Array.isArray(raw.custom_fields)) for (const cf of raw.custom_fields) {
      const cfGid = cf && typeof cf === 'object' && typeof cf.gid === 'string' ? cf.gid : null
      if (!cfGid) continue
      const val = customFieldValue(cf)
      const name = str(cf.name) || '(field)'
      const type = str(cf.type) || 'unknown'
      let def = cfMap.get(cfGid)
      if (!def) {
        def = { gid: cfGid, name, type, valueCount: 0, looksLikePriority: PRIORITY_NAME_RE.test(name) }
        cfMap.set(cfGid, def)
      }
      if (val) {
        customFieldValues[cfGid] = val
        def.valueCount++
      }
    }

    const tags: string[] = []
    if (Array.isArray(raw.tags)) for (const t of raw.tags) {
      const n = t && typeof t === 'object' ? str(t.name).trim() : ''
      if (n) tags.push(n)
    }

    if (parentGid) subtasks++
    else rootTasks++

    tasks.push({
      gid,
      title,
      titleEmpty,
      description,
      completed,
      completedAt: completedAt.iso,
      sourceCreatedAt: created.iso,
      startOn: start.date,
      dueOn: due.date,
      startInvalid: start.invalid,
      dueInvalid: due.invalid,
      assigneeGid,
      assigneeName: assigneeGid ? str(assignee.name) : null,
      followerGids,
      parentGid,
      projectGids: [...projectGids],
      sections: [...sections],
      permalink: str(raw.permalink_url) || null,
      tags,
      sectionByProject,
      customFieldValues,
      occurrences: agg.count,
      conflict: agg.conflict,
    })
  }

  const summary: NormalizeSummary = {
    rootTasks,
    subtasks,
    uniqueEntities: tasks.length,
    duplicateGids,
    completedCount,
    notCompletedCount: tasks.length - completedCount,
    missingAssignee,
    emptyTitle,
    projects: projMap.size,
    users: userMap.size,
    warnings: warnings.length,
    maxDepthSeen: state.maxDepthSeen,
    truncatedDepth: state.truncatedDepth,
  }

  return {
    tasks,
    projects: [...projMap.values()].sort((a, b) => b.taskCount - a.taskCount),
    users: [...userMap.values()].sort((a, b) => b.count - a.count),
    customFields: [...cfMap.values()].sort((a, b) => Number(b.looksLikePriority) - Number(a.looksLikePriority) || b.valueCount - a.valueCount),
    sections: [...sectMap.values()].sort((a, b) => b.count - a.count),
    sectionsByProject: Object.fromEntries(
      [...sectByProjMap].map(([pg, m]) => [pg, [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)]),
    ),
    summary,
    warnings,
  }
}
