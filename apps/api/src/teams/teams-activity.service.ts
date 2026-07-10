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

  /** Resolve Entra Object ID: user.entra_id → external_user_mappings (bỏ placeholder hrm-emp-*). */
  private async resolveEntraId(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { entraId: true } })
    if (u?.entraId && GUID.test(u.entraId)) return u.entraId
    const m = await this.prisma.externalUserMapping.findUnique({ where: { userId }, select: { entraObjectId: true } })
    if (m?.entraObjectId && GUID.test(m.entraObjectId)) return m.entraObjectId // placeholder 'hrm-emp-*' fail GUID → bỏ
    return null
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

      let lastError = ''
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
          // 4xx (trừ 429) = lỗi cấu hình/quyền — retry vô ích
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
