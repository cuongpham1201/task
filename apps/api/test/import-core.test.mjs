// P1-6 — Unit test parser + normalizer (node:test built-in, chạy trên dist đã build).
// Chạy: npm run test  (node --test test/)  — 0 package mới.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as parser from '../dist/import/asana-parser.js'
import * as norm from '../dist/import/asana-normalizer.js'
import * as consts from '../dist/import/import.constants.js'

const wrap = (data) => JSON.stringify({ data })
const task = (o) => ({ resource_type: 'task', ...o })

// ── Parser ──
test('parse JSON hợp lệ → data array', () => {
  const p = parser.parseAsanaJson(wrap([task({ gid: '1', name: 'A' })]))
  assert.equal(p.data.length, 1)
})

test('JSON sai cú pháp → INVALID_JSON', () => {
  assert.throws(() => parser.parseAsanaJson('{ not json'), (e) => e.code === 'INVALID_JSON')
})

test('root thiếu mảng data → NO_DATA_ARRAY', () => {
  assert.throws(() => parser.parseAsanaJson(JSON.stringify({ nope: [] })), (e) => e.code === 'NO_DATA_ARRAY')
})

test('root không phải object → NOT_OBJECT', () => {
  assert.throws(() => parser.parseAsanaJson('[1,2,3]'), (e) => e.code === 'NOT_OBJECT')
})

test('rỗng → EMPTY', () => {
  assert.throws(() => parser.parseAsanaJson('   '), (e) => e.code === 'EMPTY')
})

test('quá lớn → TOO_LARGE', () => {
  const big = 'a'.repeat(consts.IMPORT_LIMITS.MAX_RAW_BYTES + 10)
  assert.throws(() => parser.parseAsanaJson(big), (e) => e.code === 'TOO_LARGE')
})

test('loại bỏ key nguy hiểm __proto__ (chống prototype pollution)', () => {
  const p = parser.parseAsanaJson('{"data":[{"gid":"1","name":"A","__proto__":{"polluted":true}}]}')
  assert.equal(p.data[0].__proto__?.polluted, undefined)
  assert.equal(({}).polluted, undefined)
})

// ── Normalizer: dedupe + merge ──
test('dedupe root + nested cùng gid → 1 entity, giữ parent', () => {
  const data = [
    task({ gid: 'P', name: 'Parent', subtasks: [task({ gid: 'C', name: 'Child' })] }),
    task({ gid: 'C', name: 'Child', parent: { gid: 'P' } }), // xuất hiện lại ở root
  ]
  const r = norm.normalize(data)
  const child = r.tasks.filter((t) => t.gid === 'C')
  assert.equal(child.length, 1, 'chỉ 1 entity cho gid C')
  assert.equal(child[0].parentGid, 'P')
  assert.equal(r.summary.duplicateGids, 1)
})

test('merge deterministic: chọn payload đầy đủ hơn + cờ conflict', () => {
  const data = [
    task({ gid: 'X', name: 'X' }),
    task({ gid: 'X', name: 'X', notes: 'chi tiết', assignee: { gid: 'u1', name: 'Ann' }, due_on: '2026-07-20' }),
  ]
  const r = norm.normalize(data)
  const x = r.tasks.find((t) => t.gid === 'X')
  assert.equal(x.description, 'chi tiết', 'giữ bản đầy đủ hơn')
  assert.equal(x.dueOn, '2026-07-20')
  assert.equal(x.conflict, true)
})

test('KHÔNG dedupe theo title: 2 gid khác cùng tên → 2 entity', () => {
  const r = norm.normalize([task({ gid: 'a', name: 'Trùng tên' }), task({ gid: 'b', name: 'Trùng tên' })])
  assert.equal(r.tasks.length, 2)
})

test('task thuộc nhiều project + gom section', () => {
  const data = [task({
    gid: '1', name: 'M',
    projects: [{ gid: 'P1', name: 'Khối' }],
    memberships: [{ project: { gid: 'P2', name: 'Ban' }, section: { name: 'Công việc BP' } }],
  })]
  const r = norm.normalize(data)
  const t = r.tasks[0]
  assert.deepEqual(new Set(t.projectGids), new Set(['P1', 'P2']))
  assert.deepEqual(t.sections, ['Công việc BP'])
  assert.equal(r.projects.length, 2)
  assert.equal(r.sections[0].name, 'Công việc BP')
})

test('completed + completed_at; created_at; due/start ngày', () => {
  const r = norm.normalize([task({ gid: '1', name: 'A', completed: true, completed_at: '2026-06-24T07:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z', start_on: '2026-01-01', due_on: '2026-07-20' })])
  const t = r.tasks[0]
  assert.equal(t.completed, true)
  assert.ok(t.completedAt.startsWith('2026-06-24'))
  assert.ok(t.sourceCreatedAt.startsWith('2026-01-01'))
  assert.equal(t.startOn, '2026-01-01')
  assert.equal(t.dueOn, '2026-07-20')
})

test('due_on không hợp lệ → null + warning', () => {
  const r = norm.normalize([task({ gid: '1', name: 'A', due_on: 'khong-phai-ngay' })])
  assert.equal(r.tasks[0].dueOn, null)
  assert.ok(r.warnings.some((w) => /due_on/.test(w)))
})

test('thiếu assignee + tên rỗng được đếm', () => {
  const r = norm.normalize([task({ gid: '1', name: '' }), task({ gid: '2', name: 'B', assignee: { gid: 'u', name: 'U' } })])
  assert.equal(r.summary.emptyTitle, 1)
  assert.equal(r.summary.missingAssignee, 1)
})

test('custom fields gom theo gid + cờ looksLikePriority', () => {
  const data = [task({ gid: '1', name: 'A', custom_fields: [{ gid: 'cf1', name: 'Priority', type: 'enum', enum_value: { name: 'High' } }] })]
  const r = norm.normalize(data)
  assert.equal(r.customFields[0].gid, 'cf1')
  assert.equal(r.customFields[0].looksLikePriority, true)
  assert.equal(r.customFields[0].valueCount, 1)
  assert.equal(r.tasks[0].customFieldValues.cf1, 'High')
})

test('sectionByProject + sectionsByProject (project=Khối, section=phòng ban)', () => {
  const r = norm.normalize([task({ gid: '1', name: 'A', memberships: [
    { project: { gid: 'K', name: 'Khối' }, section: { name: 'Ban A' } },
    { project: { gid: 'P8', name: 'Ban' }, section: { name: 'Công việc BP' } },
  ] })])
  assert.equal(r.tasks[0].sectionByProject.K, 'Ban A')
  assert.equal(r.tasks[0].sectionByProject.P8, 'Công việc BP')
  assert.equal(r.sectionsByProject.K[0].name, 'Ban A')
})

test('mapPriority EN/VI', () => {
  assert.equal(consts.mapPriority('Low').value, 'low')
  assert.equal(consts.mapPriority('Medium').value, 'normal')
  assert.equal(consts.mapPriority('Cao').value, 'high')
  assert.equal(consts.mapPriority('Khẩn').value, 'urgent')
  assert.equal(consts.mapPriority('bla').unknown, true)
  assert.equal(consts.mapPriority('').value, 'normal')
})
