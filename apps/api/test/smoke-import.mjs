/**
 * P1-6 — DEV smoke: chạy THẬT ImportService trên DB dev (KHÔNG qua HTTP, KHÔNG đụng pm2).
 * Tạo dữ liệu [T][SMOKE] qua 1 batch → kiểm tra → CLEANUP CHÍNH XÁC theo batchId + projectId.
 * An toàn: chỉ xoá đúng row do batch tạo; SELECT COUNT trước khi xoá, sai số → abort.
 *
 * Chạy: node --env-file=.env test/smoke-import.mjs   (từ apps/api, sau khi npm run build)
 */
import { PrismaClient } from '@prisma/client'
import { ImportService } from '../dist/import/import.service.js'

const prisma = new PrismaClient()
const svc = new ImportService(prisma)
const TAG = '[T][SMOKE]'
let ok = 0, fail = 0
const check = (cond, msg) => { if (cond) { ok++; console.log('  ✓', msg) } else { fail++; console.error('  ✗ FAIL:', msg) } }

const t = (o) => ({ resource_type: 'task', ...o })

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'admin', active: true }, select: { id: true, displayName: true } })
  const others = await prisma.user.findMany({ where: { active: true, role: { not: 'admin' } }, take: 2, select: { id: true } })
  if (!admin || others.length < 2) throw new Error('Cần ≥1 admin + ≥2 user active để smoke')
  const [u1, u2] = others
  const dept = await prisma.orgUnit.findFirst({ where: { active: true, type: 'department' }, select: { id: true } })
  console.log(`Admin=${admin.displayName}; users=${u1.id},${u2.id}; dept=${dept?.id || 'none'}`)

  // Fixture: SRC project; t1(done, au1), t2(unmapped au3→default), t3(empty title→error),
  // t4(ngoài SRC), P(root) + c1(subtask au2) — c1 lặp cả nested lẫn root (test dedupe).
  const SRC = 'SMOKESRC'
  const data = [
    t({ gid: 'sm-t1', name: `${TAG} Task done`, projects: [{ gid: SRC, name: 'Src' }], assignee: { gid: 'au1', name: 'Asana One' }, completed: true, completed_at: '2026-06-24T07:00:00.000Z', created_at: '2025-03-03T02:00:00.000Z', due_on: '2026-07-20', notes: 'ghi chú' }),
    t({ gid: 'sm-t2', name: `${TAG} Task no-assignee`, projects: [{ gid: SRC, name: 'Src' }] }),
    t({ gid: 'sm-t3', name: '   ', projects: [{ gid: SRC, name: 'Src' }], assignee: { gid: 'au1', name: 'Asana One' } }),
    t({ gid: 'sm-t4', name: `${TAG} Out of project`, projects: [{ gid: 'OTHER', name: 'Other' }], assignee: { gid: 'au1', name: 'Asana One' } }),
    t({ gid: 'sm-P', name: `${TAG} Parent`, projects: [{ gid: SRC, name: 'Src' }], assignee: { gid: 'au1', name: 'Asana One' },
      subtasks: [t({ gid: 'sm-c1', name: `${TAG} Child`, assignee: { gid: 'au2', name: 'Asana Two' } })] }),
    t({ gid: 'sm-c1', name: `${TAG} Child`, parent: { gid: 'sm-P' }, assignee: { gid: 'au2', name: 'Asana Two' } }),
  ]

  const config = {
    sourceProjectGid: SRC,
    fieldMap: { notes: true, startDate: true, dueDate: true, followers: true, priorityFieldGid: null, tags: 'ignore', appSectionMode: 'ignore', appSectionSingle: null, appSectionMap: {} },
    userMap: { au1: u1.id, au2: u2.id }, // au3/none unmapped
    missingAssigneePolicy: 'default',
    defaultAssigneeId: admin.id,
    overrides: {},
  }

  let batchId, batchId2, projectId
  const tasksBefore = await prisma.task.count()

  try {
    // ── PARSE ──
    const parsed = await svc.parse(admin.id, JSON.stringify({ data }))
    batchId = parsed.batchId
    check(parsed.summary.duplicateGids === 1, 'dedupe: 1 gid trùng (root+nested)')
    check(parsed.summary.uniqueEntities === 6, `unique entities = 6 (6 gid; c1 lặp đã gộp) (được ${parsed.summary.uniqueEntities})`)

    // ── PREVIEW (dry-run) — KHÔNG ghi Task ──
    const prev = await svc.preview(admin.id, true, batchId, config, dept?.id || null, null)
    const s = prev.plan.summary
    check(s.createTasks === 3, `preview createTasks=3 (được ${s.createTasks})`)
    check(s.createSubtasks === 1, `preview createSubtasks=1 (được ${s.createSubtasks})`)
    check(s.errors === 1, `preview errors=1 (title rỗng) (được ${s.errors})`)
    check(s.outOfProject === 1, `preview outOfProject=1 (được ${s.outOfProject})`)
    const afterPreview = await prisma.task.count()
    check(afterPreview === tasksBefore, 'DRY-RUN không ghi Task nào')

    // ── EXECUTE ──
    const exec = await svc.execute(admin.id, true, batchId, config, dept?.id || null, null, { createProject: { name: `${TAG} Import`, memberIds: [u1.id] } })
    projectId = exec.targetProjectId
    check(exec.created === 3, `execute created=3 (được ${exec.created})`)
    check(exec.createdSubtasks === 1, `execute createdSubtasks=1 (được ${exec.createdSubtasks})`)
    check(exec.failed === 0, `execute failed=0 (được ${exec.failed})`)
    check(exec.status === 'completed', `status=completed (được ${exec.status})`)

    // ── VERIFY DB ──
    const maps = await prisma.externalEntityMapping.findMany({ where: { importBatchId: batchId } })
    const taskMapIds = maps.filter((m) => m.entityType === 'task').map((m) => m.internalId)
    check(taskMapIds.length === 3, `3 mapping task (được ${taskMapIds.length})`)
    check(maps.filter((m) => m.entityType === 'subtask').length === 1, '1 mapping subtask')

    const t1 = await prisma.task.findFirst({ where: { title: `${TAG} Task done` } })
    check(!!t1 && t1.status === 'done', 't1 status=done')
    check(!!t1 && t1.completedAt && t1.completedAt.toISOString().startsWith('2026-06-24'), 't1 completedAt giữ mốc gốc')
    check(!!t1 && t1.createdAt.toISOString().startsWith('2025-03-03'), 't1 createdAt = created_at Asana (giữ mốc gốc)')
    check(!!t1 && t1.projectId === projectId, 't1 gắn project đích')
    check(!!t1 && (dept ? t1.orgUnitId === dept.id : true), 't1 gắn đơn vị mặc định')
    check(!!t1 && t1.creatorId === admin.id, 't1 creator = người import')
    check(!!t1 && !t1.isDraft && !t1.reviewRequired && !t1.actionId, 't1 không nháp / không nghiệm thu / không action')

    const t2 = await prisma.task.findFirst({ where: { title: `${TAG} Task no-assignee` } })
    check(!!t2 && t2.assigneeId === admin.id, 't2 thiếu assignee → dùng default (admin)')

    const sub = await prisma.subtask.findFirst({ where: { title: `${TAG} Child` } })
    check(!!sub && sub.assigneeId === u2.id, 'subtask gắn assignee đã map')
    check(!!sub && taskMapIds.includes(sub.taskId), 'subtask gắn đúng task cha đã tạo')

    // Suppress notifications: KHÔNG notification nào cho task đã tạo
    const notif = await prisma.notification.count({ where: { taskId: { in: taskMapIds } } })
    check(notif === 0, `notifications=0 cho task import (được ${notif})`)
    // Activity audit có record import
    const acts = await prisma.activity.count({ where: { taskId: { in: taskMapIds }, action: 'create' } })
    check(acts === 3, `activity 'create' import = 3 (được ${acts})`)
    const audit = await prisma.adminAuditLog.count({ where: { action: 'asana_import', actorId: admin.id } })
    check(audit >= 1, 'admin_audit_log có record asana_import')

    // ── RE-IMPORT (idempotency) ── parse lại + execute → 0 tạo mới
    const parsed2 = await svc.parse(admin.id, JSON.stringify({ data }))
    batchId2 = parsed2.batchId
    const exec2 = await svc.execute(admin.id, true, batchId2, config, dept?.id || null, projectId, {})
    check(exec2.created === 0 && exec2.createdSubtasks === 0, `re-import tạo 0 (được ${exec2.created}/${exec2.createdSubtasks})`)
    check(exec2.skipped >= 4, `re-import skipped ≥4 (existing) (được ${exec2.skipped})`)
    const tasksAfterReimport = await prisma.task.count()
    check(tasksAfterReimport === tasksBefore + 3, 'không tạo bản sao khi import lại')
  } finally {
    // ── CLEANUP CHÍNH XÁC theo batch/project ──
    console.log('\nCleanup…')
    const allMaps = await prisma.externalEntityMapping.findMany({ where: { importBatchId: { in: [batchId, batchId2].filter(Boolean) } }, select: { internalId: true, entityType: true } })
    const taskIds = allMaps.filter((m) => m.entityType === 'task').map((m) => m.internalId)
    // an toàn: chỉ xoá task có title bắt đầu bằng TAG
    const delCount = taskIds.length ? await prisma.task.count({ where: { id: { in: taskIds }, title: { startsWith: TAG } } }) : 0
    if (delCount !== taskIds.length) { console.error(`  ⚠ abort cleanup: ${delCount}/${taskIds.length} task khớp TAG — xoá tay theo batch ${batchId}`); }
    else {
      await prisma.externalEntityMapping.deleteMany({ where: { importBatchId: { in: [batchId, batchId2].filter(Boolean) } } })
      if (taskIds.length) await prisma.task.deleteMany({ where: { id: { in: taskIds } } }) // cascade: subtask/watcher/activity
      if (projectId) await prisma.workspace.deleteMany({ where: { id: projectId, name: { startsWith: TAG } } })
      for (const bid of [batchId, batchId2].filter(Boolean)) {
        await prisma.adminAuditLog.deleteMany({ where: { action: 'asana_import', metadata: { path: ['batchId'], equals: bid } } })
      }
      await prisma.externalImportBatch.deleteMany({ where: { id: { in: [batchId, batchId2].filter(Boolean) } } })
      console.log('  ✓ đã dọn dữ liệu smoke')
    }
    const finalCount = await prisma.task.count()
    check(finalCount === tasksBefore, `task count trở về ban đầu (${tasksBefore})`)
    await prisma.$disconnect()
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${ok} ok, ${fail} fail`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error('SMOKE ERROR:', e); await prisma.$disconnect().catch(() => {}); process.exit(1) })
