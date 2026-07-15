// P1-6 — Unit test planner (buildPlan) trên dist đã build.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as norm from '../dist/import/asana-normalizer.js'
import * as planner from '../dist/import/import-planner.js'

const task = (o) => ({ resource_type: 'task', ...o })
const baseFieldMap = { notes: true, startDate: true, dueDate: true, followers: true, priorityFieldGid: null, tags: 'ignore', appSectionMode: 'ignore', appSectionSingle: null, appSectionMap: {} }
const cfg = (over = {}) => ({ sourceProjectGid: 'SRC', fieldMap: baseFieldMap, userMap: {}, orgBySection: {}, orgFromAssignee: false, missingAssigneePolicy: 'default', defaultAssigneeId: null, overrides: {}, ...over })
const ctx = (over = {}) => ({ activeUserIds: new Set(), userOrgUnit: {}, existingGids: new Set(), targetProjectId: null, defaultOrgUnitId: null, ...over })
const plan = (data, c, x) => planner.buildPlan(norm.normalize(data), c, x)
const inSrc = (extra = {}) => ({ projects: [{ gid: 'SRC', name: 'Nguồn' }], ...extra })

test('chỉ tạo task thuộc source project; task ngoài → outOfProject', () => {
  const data = [
    task({ gid: 't1', name: 'In', ...inSrc(), assignee: { gid: 'u1', name: 'U' } }),
    task({ gid: 't2', name: 'Out', projects: [{ gid: 'OTHER', name: 'X' }], assignee: { gid: 'u1', name: 'U' } }),
  ]
  const p = plan(data, cfg({ userMap: { u1: 'app1' } }), ctx({ activeUserIds: new Set(['app1']) }))
  assert.equal(p.summary.createTasks, 1)
  assert.equal(p.summary.outOfProject, 1)
  assert.equal(p.items.find((i) => i.gid === 't1').action, 'create')
})

test('subtask của root được chọn → tạo subtask; parent ngoài dự án → orphan skip', () => {
  const data = [
    task({ gid: 'P', name: 'Parent', ...inSrc(), assignee: { gid: 'u1', name: 'U' }, subtasks: [task({ gid: 'C', name: 'Child', assignee: { gid: 'u1', name: 'U' } })] }),
    task({ gid: 'Pout', name: 'POut', projects: [{ gid: 'OTHER', name: 'X' }], subtasks: [task({ gid: 'Corphan', name: 'Orphan' })] }),
  ]
  const p = plan(data, cfg({ userMap: { u1: 'app1' } }), ctx({ activeUserIds: new Set(['app1']) }))
  assert.equal(p.items.find((i) => i.gid === 'C').action, 'create')
  assert.equal(p.items.find((i) => i.gid === 'C').kind, 'subtask')
  const orphan = p.items.find((i) => i.gid === 'Corphan')
  assert.equal(orphan.action, 'skip')
  assert.ok(/mồ côi|cha/.test(orphan.reason))
})

test('subtask lồng sâu >1 cấp → flatten lên task gốc + warning', () => {
  const data = [task({
    gid: 'P', name: 'P', ...inSrc(), assignee: { gid: 'u1', name: 'U' },
    subtasks: [task({ gid: 'C1', name: 'C1', assignee: { gid: 'u1', name: 'U' }, subtasks: [task({ gid: 'C2', name: 'C2', assignee: { gid: 'u1', name: 'U' } })] })],
  })]
  const p = plan(data, cfg({ userMap: { u1: 'app1' } }), ctx({ activeUserIds: new Set(['app1']) }))
  const c2 = p.items.find((i) => i.gid === 'C2')
  assert.equal(c2.kind, 'subtask')
  assert.equal(c2.parentGid, 'P', 'gắn về task gốc')
  assert.ok(c2.warnings.some((w) => /lồng sâu/.test(w)))
})

test('idempotency: gid đã import → existing (không tạo lại)', () => {
  const data = [task({ gid: 't1', name: 'A', ...inSrc(), assignee: { gid: 'u1', name: 'U' } })]
  const p = plan(data, cfg({ userMap: { u1: 'app1' } }), ctx({ activeUserIds: new Set(['app1']), existingGids: new Set(['t1']) }))
  assert.equal(p.items[0].action, 'existing')
  assert.equal(p.summary.createTasks, 0)
  assert.equal(p.summary.existing, 1)
})

test('thiếu assignee — policy default có người mặc định → gán + warning', () => {
  const data = [task({ gid: 't1', name: 'A', ...inSrc() })]
  const p = plan(data, cfg({ missingAssigneePolicy: 'default', defaultAssigneeId: 'app9' }), ctx({ activeUserIds: new Set(['app9']) }))
  assert.equal(p.items[0].action, 'create')
  assert.equal(p.items[0].assigneeId, 'app9')
  assert.ok(p.items[0].warnings.some((w) => /mặc định/.test(w)))
})

test('thiếu assignee — policy skip → skip', () => {
  const data = [task({ gid: 't1', name: 'A', ...inSrc() })]
  const p = plan(data, cfg({ missingAssigneePolicy: 'skip' }), ctx())
  assert.equal(p.items[0].action, 'skip')
})

test('thiếu assignee — policy default KHÔNG có default (task) → error', () => {
  const data = [task({ gid: 't1', name: 'A', ...inSrc() })]
  const p = plan(data, cfg({ missingAssigneePolicy: 'default', defaultAssigneeId: null }), ctx())
  assert.equal(p.items[0].action, 'error')
})

test('assignee map tới user KHÔNG active → error (không gán inactive)', () => {
  const data = [task({ gid: 't1', name: 'A', ...inSrc(), assignee: { gid: 'u1', name: 'U' } })]
  const p = plan(data, cfg({ userMap: { u1: 'appInactive' } }), ctx({ activeUserIds: new Set() }))
  assert.equal(p.items[0].action, 'error')
  assert.ok(/hoạt động|hợp lệ/.test(p.items[0].reason))
})

test('completed=true→done + completedAt; false→todo', () => {
  const data = [
    task({ gid: 'd', name: 'D', ...inSrc(), assignee: { gid: 'u1', name: 'U' }, completed: true, completed_at: '2026-06-01T00:00:00.000Z' }),
    task({ gid: 'n', name: 'N', ...inSrc(), assignee: { gid: 'u1', name: 'U' }, completed: false }),
  ]
  const p = plan(data, cfg({ userMap: { u1: 'app1' } }), ctx({ activeUserIds: new Set(['app1']) }))
  assert.equal(p.items.find((i) => i.gid === 'd').status, 'done')
  assert.ok(p.items.find((i) => i.gid === 'd').completedAt.startsWith('2026-06-01'))
  assert.equal(p.items.find((i) => i.gid === 'n').status, 'todo')
})

test('priority từ custom field: Low→low; giá trị lạ→normal+warn; không chọn field→normal', () => {
  const mk = (val) => task({ gid: 'p' + val, name: val, ...inSrc(), assignee: { gid: 'u1', name: 'U' }, custom_fields: [{ gid: 'cf', name: 'Priority', type: 'enum', enum_value: { name: val } }] })
  const data = [mk('Low'), mk('Weird')]
  const withField = plan(data, cfg({ userMap: { u1: 'app1' }, fieldMap: { ...baseFieldMap, priorityFieldGid: 'cf' } }), ctx({ activeUserIds: new Set(['app1']) }))
  assert.equal(withField.items.find((i) => i.gid === 'pLow').priority, 'low')
  const weird = withField.items.find((i) => i.gid === 'pWeird')
  assert.equal(weird.priority, 'normal')
  assert.ok(weird.warnings.some((w) => /ưu tiên/.test(w)))
  const noField = plan([mk('Low')], cfg({ userMap: { u1: 'app1' } }), ctx({ activeUserIds: new Set(['app1']) }))
  assert.equal(noField.items[0].priority, 'normal')
})

test('title rỗng: task → error; subtask → skip', () => {
  const data = [
    task({ gid: 'P', name: '', ...inSrc(), assignee: { gid: 'u1', name: 'U' } }),
    task({ gid: 'Pok', name: 'OK', ...inSrc(), assignee: { gid: 'u1', name: 'U' }, subtasks: [task({ gid: 'Cempty', name: '   ', assignee: { gid: 'u1', name: 'U' } })] }),
  ]
  const p = plan(data, cfg({ userMap: { u1: 'app1' } }), ctx({ activeUserIds: new Set(['app1']) }))
  assert.equal(p.items.find((i) => i.gid === 'P').action, 'error')
  assert.equal(p.items.find((i) => i.gid === 'Cempty').action, 'skip')
})

test('appSection single & manual (Section — trục phân loại duy nhất)', () => {
  const data = [task({ gid: 't1', name: 'A', ...inSrc(), assignee: { gid: 'u1', name: 'U' }, memberships: [{ project: { gid: 'SRC', name: 'Nguồn' }, section: { name: 'Sự vụ nhóm' } }] })]
  const single = plan(data, cfg({ userMap: { u1: 'app1' }, fieldMap: { ...baseFieldMap, appSectionMode: 'single', appSectionSingle: 'secX' } }), ctx({ activeUserIds: new Set(['app1']) }))
  assert.equal(single.items[0].sectionId, 'secX')
  const manual = plan(data, cfg({ userMap: { u1: 'app1' }, fieldMap: { ...baseFieldMap, appSectionMode: 'manual', appSectionMap: { 'Sự vụ nhóm': 'secY' } } }), ctx({ activeUserIds: new Set(['app1']) }))
  assert.equal(manual.items[0].sectionId, 'secY')
})

test('tags append nối vào mô tả', () => {
  const data = [task({ gid: 't1', name: 'A', ...inSrc(), notes: 'ghi chú', assignee: { gid: 'u1', name: 'U' }, tags: [{ name: 'Họp' }] })]
  const p = plan(data, cfg({ userMap: { u1: 'app1' }, fieldMap: { ...baseFieldMap, tags: 'append' } }), ctx({ activeUserIds: new Set(['app1']) }))
  assert.ok(/Tags: Họp/.test(p.items[0].description))
})

test('followers → watchers (chỉ user active)', () => {
  const data = [task({ gid: 't1', name: 'A', ...inSrc(), assignee: { gid: 'u1', name: 'U' }, followers: [{ gid: 'f1', name: 'F1' }, { gid: 'f2', name: 'F2' }] })]
  const p = plan(data, cfg({ userMap: { u1: 'app1', f1: 'appF1', f2: 'inactive' } }), ctx({ activeUserIds: new Set(['app1', 'appF1']) }))
  assert.deepEqual(p.items[0].watcherIds, ['appF1'])
})

test('org theo section (project=Khối): mỗi section→1 đơn vị; không map→default', () => {
  const mk = (gid, sec) => task({ gid, name: gid, assignee: { gid: 'u1', name: 'U' }, memberships: [{ project: { gid: 'SRC', name: 'Khối' }, section: { name: sec } }] })
  const data = [mk('a', 'Ban Tài Chính'), mk('b', 'Ban Pháp Chế'), mk('c', 'Khác')]
  const c = cfg({ userMap: { u1: 'app1' }, orgBySection: { 'Ban Tài Chính': 'orgTC', 'Ban Pháp Chế': 'orgPC' } })
  const p = plan(data, c, ctx({ activeUserIds: new Set(['app1']), defaultOrgUnitId: 'orgDefault' }))
  assert.equal(p.items.find((i) => i.gid === 'a').orgUnitId, 'orgTC')
  assert.equal(p.items.find((i) => i.gid === 'b').orgUnitId, 'orgPC')
  assert.equal(p.items.find((i) => i.gid === 'c').orgUnitId, 'orgDefault', 'section không map → default')
})

test('orgFromAssignee: đơn vị = phòng người thực hiện; ưu tiên hơn section; default→dùng section', () => {
  const mk = (gid, au, sec) => task({ gid, name: gid, assignee: { gid: au, name: au }, memberships: [{ project: { gid: 'SRC', name: 'K' }, section: { name: sec } }] })
  const data = [mk('a', 'au1', 'Khối X'), mk('b', 'au2', 'Khối X'), mk('c', null, 'Khối X')]
  const c = cfg({ userMap: { au1: 'app1', au2: 'app2' }, orgFromAssignee: true, orgBySection: { 'Khối X': 'orgSection' }, defaultAssigneeId: 'appDef' })
  const x = ctx({ activeUserIds: new Set(['app1', 'app2', 'appDef']), userOrgUnit: { app1: 'deptA', app2: null, appDef: 'deptAdmin' }, defaultOrgUnitId: 'orgDefault' })
  const p = plan(data, c, x)
  assert.equal(p.items.find((i) => i.gid === 'a').orgUnitId, 'deptA', 'lấy phòng người TH')
  assert.equal(p.items.find((i) => i.gid === 'b').orgUnitId, 'orgSection', 'người TH không có phòng → fallback section')
  assert.equal(p.items.find((i) => i.gid === 'c').orgUnitId, 'orgSection', 'assignee dùng default → KHÔNG lấy phòng admin, fallback section')
})

test('override orgUnit thắng cả section-map', () => {
  const data = [task({ gid: 'a', name: 'A', assignee: { gid: 'u1', name: 'U' }, memberships: [{ project: { gid: 'SRC', name: 'K' }, section: { name: 'Ban A' } }] })]
  const c = cfg({ userMap: { u1: 'app1' }, orgBySection: { 'Ban A': 'orgA' }, overrides: { a: { orgUnitId: 'orgOverride' } } })
  const p = plan(data, c, ctx({ activeUserIds: new Set(['app1']), defaultOrgUnitId: 'orgDefault' }))
  assert.equal(p.items[0].orgUnitId, 'orgOverride')
})

test('Section (danh sách chung): single gán 1 cho tất cả; manual theo section nguồn', () => {
  const data = [
    task({ gid: 'a', name: 'A', assignee: { gid: 'u1', name: 'U' }, memberships: [{ project: { gid: 'SRC', name: 'K' }, section: { name: 'Nhóm 1' } }] }),
    task({ gid: 'b', name: 'B', assignee: { gid: 'u1', name: 'U' }, memberships: [{ project: { gid: 'SRC', name: 'K' }, section: { name: 'Nhóm 2' } }] }),
  ]
  const single = plan(data, cfg({ userMap: { u1: 'app1' }, fieldMap: { ...baseFieldMap, appSectionMode: 'single', appSectionSingle: 'secX' } }), ctx({ activeUserIds: new Set(['app1']) }))
  assert.equal(single.items.find((i) => i.gid === 'a').sectionId, 'secX')
  assert.equal(single.items.find((i) => i.gid === 'b').sectionId, 'secX')
  const manual = plan(data, cfg({ userMap: { u1: 'app1' }, fieldMap: { ...baseFieldMap, appSectionMode: 'manual', appSectionMap: { 'Nhóm 1': 'sec1' } } }), ctx({ activeUserIds: new Set(['app1']) }))
  assert.equal(manual.items.find((i) => i.gid === 'a').sectionId, 'sec1')
  assert.equal(manual.items.find((i) => i.gid === 'b').sectionId, null, 'section chưa map → null')
})

test('override skip → skip; override assignee/status/priority áp dụng', () => {
  const data = [task({ gid: 't1', name: 'A', ...inSrc(), assignee: { gid: 'u1', name: 'U' } })]
  const p = plan(data, cfg({ userMap: { u1: 'app1' }, overrides: { t1: { assigneeId: 'app2', status: 'done', priority: 'high' } } }), ctx({ activeUserIds: new Set(['app1', 'app2']) }))
  const it = p.items[0]
  assert.equal(it.assigneeId, 'app2')
  assert.equal(it.status, 'done')
  assert.equal(it.priority, 'high')
})
