/**
 * P1-6 — Làm sạch cấu hình mapping từ client (dynamic-key: userMap/overrides theo gid).
 * ValidationPipe global KHÔNG deep-validate object lồng key động → sanitize thủ công:
 * chỉ đọc field đã biết, ép kiểu, bỏ key nguy hiểm (chống prototype pollution).
 */
import { APP_TASK_SECTIONS, type AppTaskSection } from './import.constants'
import type { ImportConfig, ImportFieldMap, TaskOverride } from './import-planner'

const DANGEROUS = new Set(['__proto__', 'constructor', 'prototype'])
const bool = (v: any, d = false) => (typeof v === 'boolean' ? v : d)
const str = (v: any): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const section = (v: any): AppTaskSection | null => (typeof v === 'string' && (APP_TASK_SECTIONS as readonly string[]).includes(v) ? (v as AppTaskSection) : null)
const priority = (v: any): 'low' | 'normal' | 'high' | 'urgent' | undefined =>
  v === 'low' || v === 'normal' || v === 'high' || v === 'urgent' ? v : undefined
const status = (v: any): 'todo' | 'done' | undefined => (v === 'todo' || v === 'done' ? v : undefined)

function sanitizeFieldMap(raw: any): ImportFieldMap {
  const r = raw && typeof raw === 'object' ? raw : {}
  const sectionMap: Record<string, AppTaskSection | null> = {}
  if (r.sectionMap && typeof r.sectionMap === 'object') {
    for (const [k, v] of Object.entries(r.sectionMap)) {
      if (DANGEROUS.has(k)) continue
      sectionMap[k] = section(v)
    }
  }
  const appSectionMap: Record<string, string | null> = {}
  if (r.appSectionMap && typeof r.appSectionMap === 'object') {
    for (const [k, v] of Object.entries(r.appSectionMap)) {
      if (DANGEROUS.has(k)) continue
      appSectionMap[k] = typeof v === 'string' && v ? v : null
    }
  }
  return {
    notes: bool(r.notes, true),
    startDate: bool(r.startDate, true),
    dueDate: bool(r.dueDate, true),
    followers: bool(r.followers, true),
    priorityFieldGid: str(r.priorityFieldGid),
    tags: r.tags === 'append' ? 'append' : 'ignore',
    sectionMode: r.sectionMode === 'single' || r.sectionMode === 'manual' ? r.sectionMode : 'ignore',
    sectionSingle: section(r.sectionSingle),
    sectionMap,
    appSectionMode: r.appSectionMode === 'single' || r.appSectionMode === 'manual' ? r.appSectionMode : 'ignore',
    appSectionSingle: str(r.appSectionSingle),
    appSectionMap,
  }
}

function sanitizeOverrides(raw: any): Record<string, TaskOverride> {
  const out: Record<string, TaskOverride> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [gid, v] of Object.entries(raw)) {
    if (DANGEROUS.has(gid) || !v || typeof v !== 'object') continue
    const o = v as any
    const ov: TaskOverride = {}
    if (typeof o.skip === 'boolean') ov.skip = o.skip
    if (typeof o.title === 'string') ov.title = o.title
    if (o.assigneeId === null || typeof o.assigneeId === 'string') ov.assigneeId = o.assigneeId || null
    const st = status(o.status); if (st) ov.status = st
    const pr = priority(o.priority); if (pr) ov.priority = pr
    if (o.orgUnitId === null || typeof o.orgUnitId === 'string') ov.orgUnitId = o.orgUnitId || null
    if (o.section === null || typeof o.section === 'string') ov.section = section(o.section)
    out[gid] = ov
  }
  return out
}

function sanitizeStringMap(raw: any): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (DANGEROUS.has(k)) continue
      out[k] = typeof v === 'string' && v ? v : null
    }
  }
  return out
}

export function sanitizeConfig(raw: any): ImportConfig {
  const r = raw && typeof raw === 'object' ? raw : {}
  return {
    sourceProjectGid: str(r.sourceProjectGid) || '',
    fieldMap: sanitizeFieldMap(r.fieldMap),
    userMap: sanitizeStringMap(r.userMap),
    orgBySection: sanitizeStringMap(r.orgBySection),
    orgFromAssignee: bool(r.orgFromAssignee, false),
    missingAssigneePolicy: r.missingAssigneePolicy === 'skip' ? 'skip' : 'default',
    defaultAssigneeId: str(r.defaultAssigneeId),
    overrides: sanitizeOverrides(r.overrides),
  }
}

/** Org-unit id được tham chiếu trong config (để nạp + kiểm active). */
export function referencedOrgIds(cfg: ImportConfig): string[] {
  const ids = new Set<string>()
  for (const v of Object.values(cfg.orgBySection)) if (v) ids.add(v)
  for (const ov of Object.values(cfg.overrides)) if (ov.orgUnitId) ids.add(ov.orgUnitId)
  return [...ids]
}

/** Section (danh sách chung) id được tham chiếu trong config. */
export function referencedSectionIds(cfg: ImportConfig): string[] {
  const ids = new Set<string>()
  const fm = cfg.fieldMap
  if (fm.appSectionSingle) ids.add(fm.appSectionSingle)
  for (const v of Object.values(fm.appSectionMap)) if (v) ids.add(v)
  return [...ids]
}

/** Tập user-id được tham chiếu trong config (để nạp + kiểm active). */
export function referencedUserIds(cfg: ImportConfig): string[] {
  const ids = new Set<string>()
  for (const v of Object.values(cfg.userMap)) if (v) ids.add(v)
  if (cfg.defaultAssigneeId) ids.add(cfg.defaultAssigneeId)
  for (const ov of Object.values(cfg.overrides)) if (ov.assigneeId) ids.add(ov.assigneeId)
  return [...ids]
}
