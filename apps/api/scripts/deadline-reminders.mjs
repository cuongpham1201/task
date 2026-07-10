/**
 * Nhắc deadline (cơ bản): quét task sắp đến hạn / quá hạn → tạo notification cho assignee.
 * Idempotent: không tạo trùng nếu đã có notif cùng (user, task, type) trong ~18h.
 * Chạy: npm run reminders  (có thể đặt cron ngoài; KHÔNG email/Teams).
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const DONE = ['done', 'paused']

// ── Teams Activity (port tối giản của TeamsActivityService cho script standalone) ──
// Gate: TEAMS_ACTIVITY_ENABLED=true + AZURE_AD_*; idempotent qua teams_activity_deliveries.event_key.
const GUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
let _tok = null
async function graphToken() {
  if (_tok && Date.now() < _tok.exp - 60_000) return _tok.v
  const body = new URLSearchParams({
    client_id: process.env.AZURE_AD_CLIENT_ID, client_secret: process.env.AZURE_AD_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
  })
  const r = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10000) })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error_description || j.error)
  _tok = { v: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 }
  return _tok.v
}
async function sendTeamsReminder(userId, activityType, title, taskId, dayKey) {
  try {
    if (process.env.TEAMS_ACTIVITY_ENABLED !== 'true') return
    if (!process.env.AZURE_AD_TENANT_ID || !process.env.AZURE_AD_CLIENT_ID || !process.env.AZURE_AD_CLIENT_SECRET) return
    const eventKey = `${activityType}:${taskId}:${userId}:${dayKey}`
    let d
    try {
      d = await prisma.teamsActivityDelivery.create({ data: { eventKey, recipientId: userId, activityType, targetType: 'task', targetId: taskId, status: 'pending' } })
    } catch { return } // đã gửi hôm nay → không trùng
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { entraId: true } })
    let entra = u?.entraId && GUID.test(u.entraId) ? u.entraId : null
    if (!entra) {
      const m = await prisma.externalUserMapping.findUnique({ where: { userId }, select: { entraObjectId: true } })
      if (m?.entraObjectId && GUID.test(m.entraObjectId)) entra = m.entraObjectId
    }
    if (!entra) { await prisma.teamsActivityDelivery.update({ where: { id: d.id }, data: { status: 'skipped_missing_entra_id' } }); return }
    const base = (process.env.TASK_APP_BASE_URL || 'https://task.biahalong.com').replace(/\/$/, '')
    const path = `/my-tasks?task=${taskId}`
    const appId = process.env.TEAMS_APP_ID?.trim()
    const webUrl = appId
      ? `https://teams.microsoft.com/l/entity/${appId}/giaoviec-home?${new URLSearchParams({ webUrl: base + path, context: JSON.stringify({ subEntityId: path }) })}`
      : base + path
    const payload = {
      topic: { source: 'text', value: title.slice(0, 50), webUrl },
      activityType,
      previewText: { content: activityType === 'taskOverdue' ? 'Công việc đã quá hạn' : 'Công việc sắp đến hạn' },
      templateParameters: [{ name: 'taskInfo', value: title.slice(0, 100) }],
    }
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(entra)}/teamwork/sendActivityNotification`, {
      method: 'POST', headers: { Authorization: `Bearer ${await graphToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
    })
    await prisma.teamsActivityDelivery.update({
      where: { id: d.id },
      data: res.status === 204
        ? { status: 'sent', recipientEntra: entra, attemptCount: 1, sentAt: new Date() }
        : { status: 'error', recipientEntra: entra, attemptCount: 1, lastError: `HTTP ${res.status}` },
    })
  } catch (e) { console.warn('teams reminder skip:', e?.message || e) }
}

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
    // Teams Activity (idempotent theo ngày, gate flag; fire-and-forget)
    const dayKey = new Date().toISOString().slice(0, 10)
    const tk = await prisma.task.findUnique({ where: { id: t.id }, select: { title: true } })
    void sendTeamsReminder(t.assigneeId, type === 'overdue' ? 'taskOverdue' : 'taskDueSoon', tk?.title || 'Công việc', t.id, dayKey)
  }
  console.log(JSON.stringify({ scanned: tasks.length, dueSoon, overdue }))
  await prisma.$disconnect()
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
