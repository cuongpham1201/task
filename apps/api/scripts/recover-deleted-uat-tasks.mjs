/**
 * INCIDENT RECOVERY — tạo lại 6 task UAT bị xóa nhầm (2026-07-10).
 * Bằng chứng còn lại CHỈ có: id + title + status (mọi field khác đã mất, không đoán).
 * - Dùng Prisma create (giữ ID gốc), KHÔNG gọi notifications.emit → KHÔNG phát thông báo.
 * - Idempotent: bỏ qua nếu task đã tồn tại (theo id hoặc exact title).
 * - Placeholder hợp lệ: creator/assignee = admin recovery; org = org của admin (đánh dấu ở description).
 * - KHÔNG DELETE/UPDATE gì khác.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

if (!/\/giaoviec(\?|$)/.test(process.env.DATABASE_URL || '')) {
  console.error('❌ DATABASE_URL không phải giaoviec — dừng.'); process.exit(1)
}

const LOST = [
  { id: '11b2bc37-3a27-4513-ab93-f9a94d057e94', title: 'Sửa camera và mạng nhà nấu', status: 'doing' },
  { id: '2de09afb-9e02-44eb-a536-6bec2d04b461', title: 'lắp camera nhà xe theo yêu cầu SHE', status: 'doing' },
  { id: '93c83be8-0565-4087-8fd5-613ac4807a92', title: 'Lắp camera theo yêu cầu KBBX', status: 'doing' },
  { id: 'f6e588f5-9259-4b50-bf08-c6b2ceadba51', title: 'Lăp camera theo yêu cầu PXSX', status: 'doing' },
  { id: 'ce8d8425-33d8-4c96-9672-bcf120619de2', title: 'Test flow app', status: 'doing' },
  { id: '5b31b072-f2aa-4fc6-9fe2-be5aa077da1d', title: 'Test giao diện và chức năng', status: 'done' },
]
const NOTE = '⚠ [KHÔI PHỤC 2026-07-10] Tạo lại sau khi bị xóa nhầm. Người thực hiện / đơn vị / hạn / mô tả gốc ĐÃ MẤT — vui lòng gán lại.'

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'admin' }, select: { id: true, orgUnitId: true } })
  if (!admin) { console.error('❌ Không tìm thấy admin để làm creator recovery.'); process.exit(1) }

  const notifBefore = await prisma.notification.count()
  const result = { RECOVERED_PARTIAL: [], SKIPPED_EXISTING: [], FAILED: [] }

  for (const t of LOST) {
    const exists = await prisma.task.findFirst({ where: { OR: [{ id: t.id }, { title: t.title }] }, select: { id: true } })
    if (exists) { result.SKIPPED_EXISTING.push(t.title); continue }
    const done = t.status === 'done'
    try {
      await prisma.$transaction(async (tx) => {
        await tx.task.create({
          data: {
            id: t.id,
            title: t.title,
            description: NOTE,
            expectedOutput: '',
            status: t.status,
            creatorId: admin.id,
            assigneeId: admin.id, // placeholder — assignee gốc đã mất
            orgUnitId: admin.orgUnitId, // default hợp lệ (org của admin) — KHÔNG phải org gốc
            workspaceId: null,
            reviewRequired: false,
            isScorable: false,
            priority: 'normal',
            progress: done ? 100 : 0,
            completedAt: done ? new Date() : null,
            completedById: done ? admin.id : null,
          },
        })
        // 1 activity nội bộ đánh dấu recovery (KHÔNG tạo notification)
        await tx.activity.create({
          data: { taskId: t.id, userId: admin.id, action: 'edit', metadata: { recovery: 'incident_recovery', date: '2026-07-10' } },
        })
      })
      result.RECOVERED_PARTIAL.push(t.title)
    } catch (e) {
      result.FAILED.push({ title: t.title, error: String(e.message || e) })
    }
  }

  const notifAfter = await prisma.notification.count()
  console.log(JSON.stringify({
    ...result,
    notifBefore, notifAfter, notifDelta: notifAfter - notifBefore,
    tasksNow: await prisma.task.count(),
  }, null, 2))
  await prisma.$disconnect()
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
