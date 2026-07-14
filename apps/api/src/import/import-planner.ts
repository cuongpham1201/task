/**
 * P1-6 — Planner: từ dữ liệu chuẩn hoá + cấu hình ánh xạ → KẾ HOẠCH import (pure).
 *
 * Quyết định mỗi entity: tạo Task / tạo Subtask / bỏ qua / lỗi / đã tồn tại.
 * KHÔNG chạm DB — nhận sẵn tập user active, gid đã import, project/org đích qua context.
 * Dùng chung cho dry-run (preview) và execute (execute chỉ revalidate + ghi).
 *
 * Quy tắc chốt:
 *  - Chỉ tạo Task cho task ROOT (không cha) thuộc ĐÚNG source project đã chọn.
 *  - Subtask: chỉ giữ nếu tổ tiên gốc là một Task được chọn; sâu >1 cấp → flatten
 *    về Task tổ tiên + warning; thiếu cha/cha ngoài dự án → skip (không tạo orphan).
 *  - Dedupe theo gid (đã import trước → existing/skip). KHÔNG theo title/date.
 *  - creator = người import (không lấy từ JSON) — set ở service.
 *  - assignee thiếu: theo policy (default/skip); KHÔNG âm thầm gán người import.
 */
import { mapPriority, type ImportTaskStatus, type AppTaskSection, APP_TASK_SECTIONS, IMPORT_LIMITS } from './import.constants'
import type { NormalizedTask, NormalizeResult } from './asana-normalizer'

export interface ImportFieldMap {
  notes: boolean
  startDate: boolean
  dueDate: boolean
  followers: boolean
  priorityFieldGid: string | null
  tags: 'ignore' | 'append'
  sectionMode: 'ignore' | 'single' | 'manual'
  sectionSingle: AppTaskSection | null
  sectionMap: Record<string, AppTaskSection | null>
}

export interface TaskOverride {
  skip?: boolean
  title?: string
  assigneeId?: string | null
  status?: ImportTaskStatus
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  orgUnitId?: string | null
  section?: AppTaskSection | null
}

export interface ImportConfig {
  sourceProjectGid: string
  fieldMap: ImportFieldMap
  userMap: Record<string, string | null> // asanaUserGid → appUserId | null
  missingAssigneePolicy: 'default' | 'skip'
  defaultAssigneeId: string | null
  overrides: Record<string, TaskOverride>
}

export interface PlanContext {
  activeUserIds: Set<string>
  existingGids: Set<string> // gid đã import (mọi entityType) — chống trùng
  targetProjectId: string | null
  defaultOrgUnitId: string | null
}

export type PlanAction = 'create' | 'skip' | 'error' | 'existing'

export interface PlanItem {
  gid: string
  kind: 'task' | 'subtask'
  action: PlanAction
  reason: string | null
  parentGid: string | null
  // trường đã resolve (dùng cho execute + preview)
  title: string
  description: string
  assigneeId: string | null
  status: ImportTaskStatus
  priority: 'low' | 'normal' | 'high' | 'urgent'
  section: AppTaskSection | null
  orgUnitId: string | null
  startOn: string | null
  dueOn: string | null
  completedAt: string | null
  sourceCreatedAt: string | null
  permalink: string | null
  watcherIds: string[]
  warnings: string[]
}

export interface PlanSummary {
  createTasks: number
  createSubtasks: number
  existing: number
  skipped: number
  errors: number
  warnings: number
  outOfProject: number
  orphanSubtasks: number
}

export interface ImportPlan {
  items: PlanItem[]
  summary: PlanSummary
}

/** Tổ tiên ROOT của một gid (đi ngược parentGid, chặn vòng lặp/độ sâu). */
function rootAncestor(gid: string, byGid: Map<string, NormalizedTask>): string | null {
  let cur = byGid.get(gid)
  let hops = 0
  const seen = new Set<string>()
  while (cur && cur.parentGid) {
    if (seen.has(cur.gid) || hops++ > IMPORT_LIMITS.MAX_DEPTH) return null // vòng lặp/quá sâu
    seen.add(cur.gid)
    const parent = byGid.get(cur.parentGid)
    if (!parent) return null // thiếu cha
    cur = parent
  }
  return cur ? cur.gid : null
}

const asSection = (v: unknown): AppTaskSection | null =>
  typeof v === 'string' && (APP_TASK_SECTIONS as readonly string[]).includes(v) ? (v as AppTaskSection) : null

export function buildPlan(normalized: NormalizeResult, config: ImportConfig, ctx: PlanContext): ImportPlan {
  const byGid = new Map(normalized.tasks.map((t) => [t.gid, t]))
  const source = config.sourceProjectGid

  // Task ROOT thuộc source project = sẽ tạo Task.
  const selectedRoots = new Set<string>()
  for (const t of normalized.tasks) {
    if (!t.parentGid && t.projectGids.includes(source)) selectedRoots.add(t.gid)
  }

  const items: PlanItem[] = []
  const summary: PlanSummary = {
    createTasks: 0, createSubtasks: 0, existing: 0, skipped: 0, errors: 0, warnings: 0, outOfProject: 0, orphanSubtasks: 0,
  }

  const resolveAssignee = (t: NormalizedTask, ov: TaskOverride): { id: string | null; error: string | null; warn: string | null } => {
    let id: string | null | undefined = ov.assigneeId
    if (id === undefined) id = t.assigneeGid ? config.userMap[t.assigneeGid] ?? null : null
    if (!id) return { id: null, error: null, warn: null } // để caller áp policy
    if (!ctx.activeUserIds.has(id)) return { id: null, error: 'Người thực hiện không hợp lệ hoặc đã ngừng hoạt động', warn: null }
    return { id, error: null, warn: null }
  }

  const resolvePriority = (t: NormalizedTask, ov: TaskOverride, warns: string[]): 'low' | 'normal' | 'high' | 'urgent' => {
    if (ov.priority) return ov.priority
    const fg = config.fieldMap.priorityFieldGid
    if (!fg) return 'normal'
    const raw = t.customFieldValues[fg]
    const m = mapPriority(raw)
    if (m.unknown) warns.push(`Giá trị ưu tiên "${raw}" không nhận diện được — dùng normal.`)
    return m.value
  }

  const resolveSection = (t: NormalizedTask, ov: TaskOverride): AppTaskSection | null => {
    if (ov.section !== undefined) return ov.section
    const fm = config.fieldMap
    if (fm.sectionMode === 'single') return fm.sectionSingle ?? null
    if (fm.sectionMode === 'manual') {
      for (const s of t.sections) {
        const mapped = asSection(fm.sectionMap[s])
        if (mapped) return mapped
      }
    }
    return null
  }

  const mapWatchers = (t: NormalizedTask): string[] => {
    if (!config.fieldMap.followers) return []
    const out = new Set<string>()
    for (const fg of t.followerGids) {
      const uid = config.userMap[fg]
      if (uid && ctx.activeUserIds.has(uid)) out.add(uid)
    }
    return [...out]
  }

  const baseItem = (t: NormalizedTask, kind: 'task' | 'subtask'): PlanItem => ({
    gid: t.gid, kind, action: 'create', reason: null, parentGid: t.parentGid,
    title: '', description: '', assigneeId: null, status: t.completed ? 'done' : 'todo',
    priority: 'normal', section: null, orgUnitId: null, startOn: null, dueOn: null,
    completedAt: t.completedAt, sourceCreatedAt: t.sourceCreatedAt, permalink: t.permalink, watcherIds: [], warnings: [],
  })

  for (const t of normalized.tasks) {
    const ov = config.overrides[t.gid] || {}

    // Phân vai trò
    let kind: 'task' | 'subtask'
    let ancestorRoot: string | null = null
    if (!t.parentGid) {
      if (!t.projectGids.includes(source)) {
        summary.outOfProject++
        continue // task ngoài dự án nguồn — không import, không liệt kê
      }
      kind = 'task'
    } else {
      ancestorRoot = rootAncestor(t.gid, byGid)
      if (!ancestorRoot || !selectedRoots.has(ancestorRoot)) {
        // cha thiếu / ngoài dự án nguồn → không tạo orphan
        summary.orphanSubtasks++
        items.push({ ...baseItem(t, 'subtask'), action: 'skip', reason: 'Task cha không thuộc dự án nguồn (không tạo việc con mồ côi)', title: t.title })
        summary.skipped++
        continue
      }
      kind = 'subtask'
    }

    const item = baseItem(t, kind)
    const warns: string[] = [...(t.conflict ? ['gid trùng có nội dung khác nhau — đã chọn bản đầy đủ'] : [])]

    // Đã import trước → existing (chống trùng theo gid)
    if (ctx.existingGids.has(t.gid)) {
      item.action = 'existing'
      item.reason = 'Đã import trước đó'
      item.title = ov.title?.trim() || t.title
      items.push({ ...item, warnings: warns })
      summary.existing++
      continue
    }

    // Người dùng bỏ chọn
    if (ov.skip) {
      item.action = 'skip'
      item.reason = 'Người dùng bỏ chọn'
      item.title = ov.title?.trim() || t.title
      items.push({ ...item, warnings: warns })
      summary.skipped++
      continue
    }

    // Tiêu đề
    const title = (ov.title ?? t.title).trim()
    if (!title) {
      item.action = kind === 'task' ? 'error' : 'skip'
      item.reason = 'Tiêu đề rỗng'
      items.push({ ...item, warnings: warns })
      if (item.action === 'error') summary.errors++
      else summary.skipped++
      continue
    }
    item.title = title.length > IMPORT_LIMITS.MAX_TITLE ? title.slice(0, IMPORT_LIMITS.MAX_TITLE) : title

    // Người thực hiện
    const a = resolveAssignee(t, ov)
    if (a.error) {
      item.action = 'error'
      item.reason = a.error
      items.push({ ...item, warnings: warns })
      summary.errors++
      continue
    }
    let assigneeId = a.id
    if (!assigneeId) {
      if (config.missingAssigneePolicy === 'skip') {
        item.action = 'skip'
        item.reason = 'Thiếu người thực hiện (policy: bỏ qua)'
        items.push({ ...item, warnings: warns })
        summary.skipped++
        continue
      }
      // policy 'default'
      if (config.defaultAssigneeId && ctx.activeUserIds.has(config.defaultAssigneeId)) {
        assigneeId = config.defaultAssigneeId
        warns.push('Thiếu người thực hiện — dùng người mặc định')
      } else if (kind === 'task') {
        item.action = 'error'
        item.reason = 'Thiếu người thực hiện và chưa chọn người mặc định'
        items.push({ ...item, warnings: warns })
        summary.errors++
        continue
      }
      // subtask: assignee null được phép (schema cho phép) → giữ null
    }
    item.assigneeId = assigneeId

    // Các field còn lại
    item.description = config.fieldMap.notes ? t.description : ''
    if (config.fieldMap.tags === 'append' && t.tags.length) {
      const tagLine = `\n\n[Tags: ${t.tags.join(', ')}]`
      item.description = (item.description + tagLine).slice(0, IMPORT_LIMITS.MAX_NOTES)
    }
    item.status = ov.status ?? (t.completed ? 'done' : 'todo')
    item.priority = resolvePriority(t, ov, warns)
    item.startOn = config.fieldMap.startDate ? t.startOn : null
    item.dueOn = config.fieldMap.dueDate ? t.dueOn : null
    item.completedAt = item.status === 'done' ? t.completedAt : null

    if (kind === 'task') {
      item.section = resolveSection(t, ov)
      item.orgUnitId = ov.orgUnitId !== undefined ? ov.orgUnitId : ctx.defaultOrgUnitId
      item.watcherIds = mapWatchers(t)
    } else {
      // Subtask app chỉ giữ title/done/assignee → cảnh báo field mất nếu có dữ liệu
      const lost: string[] = []
      if (t.description) lost.push('mô tả')
      if (t.dueOn) lost.push('hạn')
      if (t.startOn) lost.push('ngày bắt đầu')
      if (lost.length) warns.push(`Việc con không lưu: ${lost.join(', ')}`)
      const depthWarn = ancestorRoot && t.parentGid !== ancestorRoot
      if (depthWarn) warns.push('Việc con lồng sâu — đã đưa lên task gốc')
      item.parentGid = ancestorRoot
    }

    item.warnings = warns
    items.push(item)
    if (kind === 'task') summary.createTasks++
    else summary.createSubtasks++
  }

  summary.warnings = items.reduce((n, i) => n + i.warnings.length, 0)
  return { items, summary }
}
