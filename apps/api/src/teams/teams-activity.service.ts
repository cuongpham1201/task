import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { GraphAppTokenService } from './graph-app-token.service'

/**
 * Teams Activity Feed cho App Giao việc — pattern approval-bhl
 * (Graph POST /users/{aadObjectId}/teamwork/sendActivityNotification, app token,
 *  topic source=text + webUrl = Teams deep link l/entity + subEntityId).
 *
 * Non-blocking tuyệt đối: mọi lỗi Graph chỉ log + ghi delivery, KHÔNG fail nghiệp vụ.
 * Gating: TEAMS_ACTIVITY_ENABLED=true + đủ AZURE_AD_* — thiếu → skip an toàn.
 * Idempotency: teams_activity_deliveries.event_key UNIQUE — trùng event → bỏ qua.
 * KHÔNG gửi cho chính actor. Thiếu Entra Object ID → skipped_missing_entra_id.
 */

// activityType PHẢI KHỚP teams/manifest.json activities.activityTypes
export type TeamsActivityType =
  | 'taskAssigned' | 'taskMentioned' | 'taskCommented' | 'taskDueSoon'
  | 'taskOverdue' | 'taskReturned' | 'taskAccepted' | 'projectMemberAdded'

// notification type nội bộ → activityType Teams (đổi progress/edit nhỏ KHÔNG có mặt ở đây)
export const NOTIF_TO_ACTIVITY: Record<string, TeamsActivityType> = {
  task_assigned: 'taskAssigned',
  mentioned: 'taskMentioned',
  comment_added: 'taskCommented',
  due_soon: 'taskDueSoon',
  overdue: 'taskOverdue',
  task_returned: 'taskReturned',
  task_accepted: 'taskAccepted',
}

const GRAPH_TIMEOUT_MS = 15_000
const MAX_ATTEMPTS = 2 // 1 lần + 1 retry (chỉ với lỗi tạm thời 429/5xx/timeout)
const GUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i

const BASE_URL = () => (process.env.TASK_APP_BASE_URL || 'https://task.biahalong.com').replace(/\/$/, '')
const TAB_ENTITY_ID = 'giaoviec-home' // khớp manifest staticTabs.entityId

export interface ActivityEvent {
  type: TeamsActivityType
  recipientUserId: string
  actorUserId?: string | null // không gửi nếu recipient === actor
  targetType: 'task' | 'project'
  targetId: string
  taskInfo: string // templateParameters {taskInfo} — tên việc/dự án (ngắn)
  previewText: string // dòng mô tả (≤150 ký tự)
  path: string // đường dẫn web app, vd /my-tasks?task=<id>
  eventSuffix?: string // phân biệt event lặp hợp lệ (commentId, yyyymmdd...)
}

@Injectable()
export class TeamsActivityService {
  private readonly log = new Logger('TeamsActivity')
  constructor(
    private readonly prisma: PrismaService,
    private readonly graphToken: GraphAppTokenService,
  ) {}

  enabled(): boolean {
    return process.env.TEAMS_ACTIVITY_ENABLED === 'true' && this.graphToken.configured()
  }

  /** Deep link Teams l/entity (pattern approval teams-deeplink.ts); thiếu app id → webUrl thường. */
  buildDeepLink(path: string): string {
    const webUrl = `${BASE_URL()}${path}`
    const appId = process.env.TEAMS_APP_ID?.trim() || process.env.TEAMS_CATALOG_APP_ID?.trim()
    if (!appId) return webUrl
    const params = new URLSearchParams({ webUrl, context: JSON.stringify({ subEntityId: path }) })
    return `https://teams.microsoft.com/l/entity/${appId}/${TAB_ENTITY_ID}?${params.toString()}`
  }

  /**
   * Resolve Entra Object ID:
   *  1. users.entra_id (đã login M365) → 2. external_user_mappings (bỏ placeholder hrm-emp-*)
   *  3. NEW: tra Graph theo email công ty (GET /users/{email}) — cho user CHƯA từng login app.
   *     Kết quả ghi lại users.entra_id để lần sau khỏi gọi Graph.
   * Cần Application permission User.Read.All.
   */
  private async resolveEntraId(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { entraId: true, email: true } })
    if (u?.entraId && GUID.test(u.entraId)) return u.entraId
    const m = await this.prisma.externalUserMapping.findUnique({ where: { userId }, select: { entraObjectId: true } })
    if (m?.entraObjectId && GUID.test(m.entraObjectId)) return m.entraObjectId // placeholder 'hrm-emp-*' fail GUID → bỏ
    // Fallback Graph: chỉ email M365 công ty (tránh gọi Graph cho email cá nhân test)
    const email = u?.email?.trim()
    if (!email || !email.toLowerCase().endsWith('@biahalong.com')) return null
    try {
      const token = await this.graphToken.getToken()
      const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}?$select=id`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
      })
      if (!res.ok) { this.log.debug?.(`resolve oid theo email ${email} → HTTP ${res.status}`); return null }
      const j: any = await res.json()
      const oid = j?.id
      if (oid && GUID.test(oid)) {
        // Ghi cache vào users.entra_id (best-effort; không fail nếu trùng unique)
        await this.prisma.user.update({ where: { id: userId }, data: { entraId: oid } }).catch(() => {})
        return oid
      }
    } catch (e: any) {
      this.log.warn(`resolve oid Graph lỗi (${email}): ${e?.message}`)
    }
    return null
  }

  /**
   * Đảm bảo app Giao việc ĐÃ được cài trong Teams cá nhân của người nhận (install-then-send).
   * Cho phép user CHƯA từng mở app vẫn nhận Activity — không cần họ tự cài.
   * Cần TEAMS_CATALOG_APP_ID + Application permission TeamsAppInstallation.ReadWriteForUser.All.
   * Idempotent: đã cài (hoặc 409 Conflict) → coi như thành công.
   */
  private async ensureInstalled(entraId: string): Promise<boolean> {
    const catalogId = process.env.TEAMS_CATALOG_APP_ID?.trim()
    if (process.env.TEAMS_AUTO_INSTALL !== 'true' || !catalogId) return true // tắt cờ → bỏ qua, để send tự xử 403
    try {
      const token = await this.graphToken.getToken()
      const auth = { Authorization: `Bearer ${token}` }
      // Đã cài chưa? lọc theo teamsApp/id (catalog app id)
      const check = await fetch(
        `https://graph.microsoft.com/v1.0/users/${entraId}/teamwork/installedApps?$expand=teamsApp&$filter=teamsApp/id+eq+'${catalogId}'`,
        { headers: auth, signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) },
      )
      if (check.ok) {
        const j: any = await check.json()
        if (Array.isArray(j.value) && j.value.length > 0) return true // đã cài
      }
      // Cài app cho user (âm thầm, không popup)
      const inst = await fetch(`https://graph.microsoft.com/v1.0/users/${entraId}/teamwork/installedApps`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'teamsApp@odata.bind': `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${catalogId}` }),
        signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
      })
      if (inst.status === 201 || inst.status === 409) return true // cài mới / đã có sẵn
      this.log.warn(`cài app cho ${entraId} → HTTP ${inst.status}: ${(await inst.text().catch(() => '')).slice(0, 200)}`)
      return false
    } catch (e: any) {
      this.log.warn(`ensureInstalled lỗi (${entraId}): ${e?.message}`)
      return false
    }
  }

  /** Gửi 1 event (fire-and-forget từ call site — KHÔNG await trong transaction nghiệp vụ). */
  async send(ev: ActivityEvent): Promise<void> {
    try {
      if (ev.actorUserId && ev.recipientUserId === ev.actorUserId) return // không tự thông báo mình
      const eventKey = `${ev.type}:${ev.targetId}:${ev.recipientUserId}:${ev.eventSuffix ?? 'v1'}`

      if (!this.enabled()) {
        // flag off/thiếu config → không ghi log ồn (chỉ debug), không gửi
        return
      }

      // Idempotency: claim event_key trước (unique) — trùng → đã xử lý, bỏ qua
      let delivery
      try {
        delivery = await this.prisma.teamsActivityDelivery.create({
          data: {
            eventKey, recipientId: ev.recipientUserId, activityType: ev.type,
            targetType: ev.targetType, targetId: ev.targetId, status: 'pending',
          },
        })
      } catch {
        return // event_key đã tồn tại → duplicate, không gửi trùng
      }

      const entraId = await this.resolveEntraId(ev.recipientUserId)
      if (!entraId) {
        await this.prisma.teamsActivityDelivery.update({ where: { id: delivery.id }, data: { status: 'skipped_missing_entra_id' } })
        return
      }

      const payload = {
        topic: { source: 'text' as const, value: ev.taskInfo.slice(0, 50) || 'Giao việc', webUrl: this.buildDeepLink(ev.path) },
        activityType: ev.type,
        previewText: { content: ev.previewText.slice(0, 150) },
        templateParameters: [{ name: 'taskInfo', value: ev.taskInfo.slice(0, 100) }],
      }
      const path = `/users/${encodeURIComponent(entraId)}/teamwork/sendActivityNotification`

      // install-then-send: đảm bảo app đã cài cho user trước khi gửi (không cần user tự mở app)
      await this.ensureInstalled(entraId)

      let lastError = ''
      let triedInstall = false
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const token = await this.graphToken.getToken()
          const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
          })
          if (res.status === 204) {
            await this.prisma.teamsActivityDelivery.update({
              where: { id: delivery.id },
              data: { status: 'sent', recipientEntra: entraId, attemptCount: attempt, sentAt: new Date() },
            })
            return
          }
          const body = await res.text().catch(() => '')
          lastError = `HTTP ${res.status}: ${body.slice(0, 300)}`
          // 403 "not authorized ... to the recipient" = app chưa cài xong → cài rồi thử LẠI 1 lần
          if (res.status === 403 && !triedInstall && /not authorized|recipient/i.test(body)) {
            triedInstall = true
            const ok = await this.ensureInstalled(entraId)
            if (ok) { await new Promise((r) => setTimeout(r, 1500)); continue }
          }
          // 4xx còn lại (trừ 429) = lỗi cấu hình/quyền — retry vô ích
          if (res.status !== 429 && res.status < 500) break
        } catch (e: any) {
          lastError = e?.message || String(e)
        }
        if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 1500))
      }
      await this.prisma.teamsActivityDelivery.update({
        where: { id: delivery.id },
        data: { status: 'error', recipientEntra: entraId, attemptCount: MAX_ATTEMPTS, lastError },
      })
      this.log.warn(`Teams activity lỗi (${ev.type} → ${ev.recipientUserId}): ${lastError}`)
    } catch (e: any) {
      // Tuyệt đối không để lỗi Teams lan sang nghiệp vụ
      this.log.warn(`Teams activity bỏ qua: ${e?.message || e}`)
    }
  }

  /** Gửi cho nhiều người (helper cho call sites). */
  sendMany(events: ActivityEvent[]): void {
    for (const ev of events) void this.send(ev)
  }
}
