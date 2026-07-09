/**
 * Nhắc deadline (cơ bản): quét task sắp đến hạn / quá hạn → tạo notification cho assignee.
 * Idempotent: không tạo trùng nếu đã có notif cùng (user, task, type) trong ~18h.
 * Chạy: npm run reminders  (có thể đặt cron ngoài; KHÔNG email/Teams).
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const DONE = ['done', 'paused']

async function alreadyNotified(userId, taskId, type) {
  const since = new Date(Date.now() - 18 * 3600 * 1000)
  const n = await prisma.notification.findFirst({ where: { userId, taskId, type, createdAt: { gte: since } } })
  return !!n
}

async function main() {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrowEnd = new Date(today); tomorrowEnd.setDate(today.getDate() + 1); tomorrowEnd.setHours(23, 59, 59, 999)

  const tasks = await prisma.task.findMany({
    where: { archived: false, dueDate: { not: null }, status: { notIn: DONE } },
    select: { id: true, assigneeId: true, dueDate: true },
  })

  let dueSoon = 0, overdue = 0
  for (const t of tasks) {
    const due = new Date(t.dueDate)
    const type = due < today ? 'overdue' : (due <= tomorrowEnd ? 'due_soon' : null)
    if (!type) continue
    if (await alreadyNotified(t.assigneeId, t.id, type)) continue
    await prisma.notification.create({ data: { userId: t.assigneeId, taskId: t.id, type } })
    type === 'overdue' ? overdue++ : dueSoon++
  }
  console.log(JSON.stringify({ scanned: tasks.length, dueSoon, overdue }))
  await prisma.$disconnect()
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
