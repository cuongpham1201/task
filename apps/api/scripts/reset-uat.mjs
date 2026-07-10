/**
 * UAT RESET — xóa toàn bộ dữ liệu nghiệp vụ (task/action/project/comment/...) + user MOCK.
 * GIỮ: users HRM, org_units, org_unit_roles (HRM/MANUAL_TEST), external mappings, sync_logs,
 *      kpi_definitions, workspace org_unit.
 * KHÔNG đụng HRM, KHÔNG xóa schema/migration. Idempotent (chạy lại an toàn).
 *
 * User mock = KHÔNG có external_user_mapping. NGOẠI LỆ giữ lại admin@biahalong.com
 * (auto-provision, không chắc mock — chờ xác nhận) và mọi user role='admin'.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const KEEP_EMAILS = ['admin@biahalong.com'] // không chắc mock → giữ, flag trong báo cáo

if (!/\/giaoviec(\?|$)/.test(process.env.DATABASE_URL || '')) {
  console.error('❌ DATABASE_URL không phải DB giaoviec — dừng.'); process.exit(1)
}

async function main() {
  const before = await counts()

  // ── SAFETY GUARD (sau sự cố 2026-07-10): không xóa nếu ĐANG có dữ liệu nghiệp vụ,
  // trừ khi xác nhận rõ UAT_RESET_CONFIRM=yes. Tránh xóa nhầm dữ liệu UAT thật. ──
  const biz = before.tasks + before.actions + before.actionUpdates + before.subtasks
    + before.comments + before.worklogs + before.reviews + before.attachments
    + before.wsProject
  if (biz > 0 && process.env.UAT_RESET_CONFIRM !== 'yes') {
    console.error(`⛔ Có ${biz} bản ghi nghiệp vụ (tasks=${before.tasks}, actions=${before.actions}, projects=${before.wsProject}...).`)
    console.error('   Có thể là dữ liệu UAT THẬT. Đặt UAT_RESET_CONFIRM=yes để xác nhận reset. DỪNG.')
    await prisma.$disconnect(); process.exit(2)
  }

  // ── 1. Xóa dữ liệu nghiệp vụ (children → parents) ──
  await prisma.notification.deleteMany({})
  await prisma.taskKpiResult.deleteMany({})
  await prisma.activity.deleteMany({})
  await prisma.comment.deleteMany({})
  await prisma.taskWorkLog.deleteMany({})
  await prisma.taskReview.deleteMany({})
  await prisma.taskCollaborator.deleteMany({})
  await prisma.taskWatcher.deleteMany({})
  await prisma.subtask.deleteMany({})
  await prisma.attachment.deleteMany({})
  await prisma.actionUpdate.deleteMany({})
  await prisma.task.deleteMany({})
  await prisma.action.deleteMany({})
  // Project = workspace type=project (+ members). GIỮ workspace org_unit.
  await prisma.workspaceMember.deleteMany({})
  await prisma.workspace.deleteMany({ where: { type: 'project' } })

  // ── 2. User MOCK (không có mapping) trừ KEEP_EMAILS / admin ──
  const mapped = new Set((await prisma.externalUserMapping.findMany({ select: { userId: true } })).map((m) => m.userId))
  const mockUsers = (await prisma.user.findMany({ select: { id: true, email: true, role: true } }))
    .filter((u) => !mapped.has(u.id) && !KEEP_EMAILS.includes(u.email) && u.role !== 'admin')
  const mockIds = mockUsers.map((u) => u.id)

  // Xóa role của user mock trước (giữ HRM_SYNC / MANUAL_TEST trên user HRM)
  await prisma.orgUnitRole.deleteMany({ where: { userId: { in: mockIds } } })
  await prisma.externalUserMapping.deleteMany({ where: { userId: { in: mockIds } } }) // an toàn (thường 0)
  await prisma.user.deleteMany({ where: { id: { in: mockIds } } })

  const after = await counts()
  console.log(JSON.stringify({
    deletedMockUsers: mockUsers.map((u) => u.email),
    keptFlagged: KEEP_EMAILS,
    before, after,
  }, null, 2))
  await prisma.$disconnect()
}

async function counts() {
  const [users, orgUnits, orgRoles, mappings, workspaces, wsProject, actions, actionUpdates, tasks, subtasks, comments, worklogs, reviews, activities, notifications, attachments, kpiResults, kpiDefs] = await Promise.all([
    prisma.user.count(), prisma.orgUnit.count(), prisma.orgUnitRole.count(), prisma.externalUserMapping.count(),
    prisma.workspace.count(), prisma.workspace.count({ where: { type: 'project' } }),
    prisma.action.count(), prisma.actionUpdate.count(), prisma.task.count(), prisma.subtask.count(),
    prisma.comment.count(), prisma.taskWorkLog.count(), prisma.taskReview.count(), prisma.activity.count(),
    prisma.notification.count(), prisma.attachment.count(), prisma.taskKpiResult.count(), prisma.kpiDefinition.count(),
  ])
  return { users, orgUnits, orgRoles, mappings, workspaces, wsProject, actions, actionUpdates, tasks, subtasks, comments, worklogs, reviews, activities, notifications, attachments, kpiResults, kpiDefs }
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
