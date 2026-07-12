import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import {
  resolveConfig, CONFIG_FIELDS, dayKey, dayDiff, dueSoonStage, overdueStage, waitStage,
  actionOverdueStage, TASK_ACTIVE_STATUSES, ACTION_OPEN_STATUSES,
  type ReminderConfig, type ConfigKey,
} from './reminder-rules'

/**
 * P1-3 — REMINDER ENGINE.
 * - Candidate query THEO RULE (dueDate range/status/deadline có index) — không quét cả bảng,
 *   không N+1 cho phần đọc (activities/task-count/user đều batch).
 * - Idempotent: reminder_deliveries.dedupe_key UNIQUE — chạy lại/retry/manual+cron/2 instance
 *   đều không tạo notification trùng (P2002 → đếm duplicate).
 * - Multi-instance: PostgreSQL advisory lock (KHÔNG lock bộ nhớ) + cờ overlap trong process.
 * - Scheduler: setInterval nội bộ (1 job duy nhất, mặc định 30'), KHÔNG thêm package;
 *   REMINDER_ENGINE_ENABLED mặc định false — DEV/prod bật riêng qua env.
 * - Dry-run: chỉ đọc + ghi 1 dòng reminder_runs (dryRun=true), KHÔNG ghi notification/delivery.
 * - Kênh: in-app notification hiện có (payload.message cụ thể + deep-link task/action).
 *   Email/Teams: không mở rộng trong phiên này (Teams reminder cũ nằm ở script deprecated).
 */

const ADVISORY_LOCK_KEY = 982347123 // khóa riêng cho reminder engine

interface Candidate {
  ruleKey: string
  entityType: 'task' | 'action'
  entityId: string
  recipientId: string
  stageKey: string
  dedupeKey: string
  notifType: string
  taskId?: string
  actionId?: string
  payload: Record<string, unknown>
}

const SETTING_KEY = 'engine'
const CACHE_MS = 60_000

@Injectable()
export class RemindersService implements OnModuleInit {
  private readonly log = new Logger('Reminders')
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  // P1-4: config hiệu lực resolve tập trung (DB override > env > default), cache ngắn,
  // invalidate khi Admin lưu. Rule đọc this.cfg — được nạp lại Ở ĐẦU MỖI RUN.
  private cfg!: ReminderConfig
  private cache: { cfg: ReminderConfig; sources: Record<ConfigKey, string>; at: number } | null = null
  private meta: { updatedAt: Date | null; updatedByName: string | null } = { updatedAt: null, updatedByName: null }
  private nextRunAt: Date | null = null

  constructor(private readonly prisma: PrismaService) {}

  /** Config hiệu lực + nguồn từng field. force=true bỏ cache (sau khi lưu). */
  async getConfig(force = false) {
    if (!force && this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache
    const row = await this.prisma.reminderSetting.findUnique({
      where: { key: SETTING_KEY },
      include: { updatedBy: { select: { displayName: true } } },
    })
    const { cfg, sources } = resolveConfig((row?.value as Record<string, unknown>) ?? null)
    this.meta = { updatedAt: row?.updatedAt ?? null, updatedByName: row?.updatedBy?.displayName ?? null }
    this.cache = { cfg, sources, at: Date.now() }
    return this.cache
  }

  /**
   * Áp config vào runtime: LUÔN hủy timer cũ trước khi tạo mới → không bao giờ
   * có 2 timer. Mọi field áp dụng NGAY (restartRequired=false) vì rule đọc config
   * ở đầu mỗi run; riêng interval/enabled xử lý tại đây.
   */
  private applyTimer(cfg: ReminderConfig) {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    this.nextRunAt = null
    if (!cfg.enabled) {
      this.log.log('Reminder engine OFF (config hiệu lực)')
      return
    }
    const ms = cfg.intervalMinutes * 60_000
    this.timer = setInterval(() => {
      this.nextRunAt = new Date(Date.now() + ms)
      this.run({ dryRun: false, trigger: 'cron' }).catch((e) => this.log.error(`cron run lỗi: ${e.message}`))
    }, ms)
    this.nextRunAt = new Date(Date.now() + ms)
    this.log.log(`Reminder engine ON — mỗi ${cfg.intervalMinutes} phút · TZ ${cfg.timezone}`)
  }

  async onModuleInit() {
    const { cfg } = await this.getConfig(true)
    this.applyTimer(cfg)
  }

  async status() {
    const { cfg, sources } = await this.getConfig()
    const lastRuns = await this.prisma.reminderRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 })
    return {
      enabled: cfg.enabled,
      config: cfg,
      sources, // database | env | default — từng field
      restartRequired: false, // mọi field áp dụng runtime (timer hủy-tạo lại khi lưu)
      timerActive: !!this.timer,
      nextRunAt: this.nextRunAt,
      runningNow: this.running,
      updatedAt: this.meta.updatedAt,
      updatedBy: this.meta.updatedByName,
      lastRuns,
    }
  }

  /** P1-4: metadata form settings — value/source/default/giới hạn từng field (không expose env raw khác). */
  async settings() {
    const { cfg, sources } = await this.getConfig(true)
    const fields = Object.fromEntries(
      (Object.keys(CONFIG_FIELDS) as ConfigKey[]).map((k) => {
        const m = CONFIG_FIELDS[k] as any
        return [k, {
          value: (cfg as any)[k], source: sources[k], default: m.def, label: m.label,
          type: m.type, min: m.min ?? null, max: m.max ?? null, allowed: m.allowed ?? null,
          restartRequired: false,
        }]
      }),
    )
    return {
      fields,
      updatedAt: this.meta.updatedAt,
      updatedBy: this.meta.updatedByName,
      notes: {
        actionEmpty: 'Ngưỡng "Action trống" dùng CHUNG với "chưa bắt đầu" (notStartedDays).',
        escalation: 'Escalation tới quản lý theo scope: CHƯA triển khai (backlog P1-5).',
        runWhenOff: 'Khi engine OFF: dry-run luôn được phép; chạy thật thủ công vẫn cho phép với xác nhận đặc biệt (idempotent).',
      },
    }
  }

  /** Lưu override (merge), audit before/after, áp runtime ngay. Atomic + không nhận field lạ (DTO whitelist). */
  async updateSettings(actorId: string, dto: Partial<ReminderConfig>) {
    const patch: Record<string, unknown> = {}
    for (const k of Object.keys(CONFIG_FIELDS) as ConfigKey[]) {
      if ((dto as any)[k] !== undefined) patch[k] = (dto as any)[k]
    }
    if (Object.keys(patch).length === 0) return { applied: false, reason: 'Không có thay đổi' }
    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.reminderSetting.findUnique({ where: { key: SETTING_KEY } })
      const before = (row?.value as Record<string, unknown>) ?? {}
      const after = { ...before, ...patch }
      await tx.reminderSetting.upsert({
        where: { key: SETTING_KEY },
        create: { key: SETTING_KEY, value: after as any, updatedById: actorId },
        update: { value: after as any, updatedById: actorId },
      })
      await tx.adminAuditLog.create({
        data: { actorId, targetUserId: null, action: 'reminder_settings', metadata: { before, after } as any },
      })
      return { before, after }
    })
    const { cfg, sources } = await this.getConfig(true) // invalidate cache
    try {
      this.applyTimer(cfg) // hủy timer cũ + tạo mới — không thể có 2 timer
      return { applied: true, restartRequired: false, config: cfg, sources, changed: Object.keys(patch), audit: result }
    } catch (e: any) {
      // timer apply lỗi (hiếm): config đã lưu — báo cần restart, KHÔNG giả đã áp dụng
      this.log.error(`applyTimer lỗi: ${e.message}`)
      return { applied: false, restartRequired: true, config: cfg, sources, changed: Object.keys(patch) }
    }
  }

  /** Chạy engine. Manual vẫn idempotent; dry-run không ghi notification. */
  async run(opts: { dryRun: boolean; trigger: 'cron' | 'manual' }) {
    if (this.running) return { skipped: true, reason: 'đang có run khác trong process' }
    this.running = true
    this.cfg = (await this.getConfig()).cfg // config hiệu lực tại thời điểm chạy
    const runId = randomUUID()
    const startedAt = new Date()
    const stats = { scanned: 0, candidates: 0, delivered: 0, skipped: 0, duplicate: 0, failed: 0 }
    const errors: string[] = []
    let locked = false
    try {
      if (!opts.dryRun) {
        // 2 instance cùng chạy → chỉ 1 bên được lock (DB-level, không phải lock bộ nhớ)
        const r = await this.prisma.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS ok`
        locked = r[0]?.ok === true
        if (!locked) {
          this.log.warn(`[${runId}] instance khác đang chạy — bỏ qua`)
          return { skipped: true, reason: 'advisory lock busy' }
        }
      }

      const candidates: Candidate[] = []
      const collect = async (name: string, fn: () => Promise<Candidate[]>) => {
        // 1 rule lỗi KHÔNG làm chết cả run
        try {
          candidates.push(...(await fn()))
        } catch (e: any) {
          stats.failed++
          errors.push(`${name}: ${e.message}`)
          this.log.error(`[${runId}] rule ${name} lỗi: ${e.message}`)
        }
      }
      await collect('taskDue', () => this.taskDueRules(stats))
      await collect('taskNotStarted', () => this.taskNotStartedRule(stats))
      await collect('taskWaitingReview', () => this.taskWaitingReviewRule(stats))
      await collect('taskReturned', () => this.taskReturnedRule(stats))
      await collect('action', () => this.actionRules(stats))

      // ── Lọc người nhận inactive (batch, 1 query) ──
      const userIds = [...new Set(candidates.map((c) => c.recipientId))]
      const activeUsers = new Set(
        (await this.prisma.user.findMany({ where: { id: { in: userIds }, active: true }, select: { id: true } })).map((u) => u.id),
      )
      const eligible = candidates.filter((c) => {
        if (!activeUsers.has(c.recipientId)) { stats.skipped++; return false }
        return true
      })
      stats.candidates = eligible.length

      // ── Dedupe check trước (batch) để đếm chính xác; UNIQUE index vẫn là chốt chặn cuối ──
      const keys = eligible.map((c) => c.dedupeKey)
      const existed = new Set<string>()
      for (let i = 0; i < keys.length; i += 500) {
        const chunk = keys.slice(i, i + 500)
        const rows = await this.prisma.reminderDelivery.findMany({ where: { dedupeKey: { in: chunk } }, select: { dedupeKey: true } })
        rows.forEach((r) => existed.add(r.dedupeKey))
      }
      const fresh = eligible.filter((c) => !existed.has(c.dedupeKey) || (stats.duplicate++, false))

      if (!opts.dryRun) {
        for (const c of fresh) {
          try {
            await this.prisma.$transaction(async (tx) => {
              await tx.reminderDelivery.create({
                data: {
                  ruleKey: c.ruleKey, entityType: c.entityType, entityId: c.entityId,
                  recipientId: c.recipientId, stageKey: c.stageKey, dedupeKey: c.dedupeKey, runId,
                },
              })
              await tx.notification.create({
                data: {
                  userId: c.recipientId, type: c.notifType as any,
                  taskId: c.taskId ?? null, actionId: c.actionId ?? null,
                  payload: c.payload as any,
                },
              })
            })
            stats.delivered++
          } catch (e: any) {
            if (e?.code === 'P2002') stats.duplicate++ // race với run song song — vẫn không trùng
            else { stats.failed++; errors.push(`deliver ${c.dedupeKey}: ${e.message}`) }
          }
        }
      }

      const finishedAt = new Date()
      await this.prisma.reminderRun.create({
        data: {
          id: runId, dryRun: opts.dryRun, trigger: opts.trigger, startedAt, finishedAt,
          scanned: stats.scanned, candidates: stats.candidates,
          delivered: opts.dryRun ? 0 : stats.delivered, skipped: stats.skipped,
          duplicate: stats.duplicate, failed: stats.failed,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          error: errors.length ? errors.slice(0, 5).join(' | ').slice(0, 900) : null,
        },
      })
      this.log.log(`[${runId}] ${opts.dryRun ? 'DRY-RUN' : opts.trigger} — scanned=${stats.scanned} candidates=${stats.candidates} delivered=${opts.dryRun ? 0 : stats.delivered} dup=${stats.duplicate} skip=${stats.skipped} fail=${stats.failed}`)
      return { runId, dryRun: opts.dryRun, ...stats, delivered: opts.dryRun ? 0 : stats.delivered, wouldDeliver: opts.dryRun ? fresh.length : undefined, errors: errors.slice(0, 5) }
    } finally {
      if (locked) await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`
      this.running = false
    }
  }

  // ══ RULE QUERIES (batch — theo index dueDate/status/deadline) ══

  /** TASK_DUE_SOON + TASK_OVERDUE — 1 query gộp theo dueDate. */
  private async taskDueRules(stats: { scanned: number }): Promise<Candidate[]> {
    const tz = this.cfg.timezone
    const today = dayKey(new Date(), tz)
    const horizon = new Date(Date.now() + (this.cfg.dueSoonDays + 1) * 86400000)
    const tasks = await this.prisma.task.findMany({
      where: {
        archived: false,
        status: { in: TASK_ACTIVE_STATUSES as any },
        dueDate: { not: null, lte: horizon },
      },
      select: { id: true, title: true, dueDate: true, assigneeId: true, creatorId: true, status: true },
    })
    stats.scanned += tasks.length
    const out: Candidate[] = []
    for (const t of tasks) {
      const dueDay = dayKey(t.dueDate!, tz)
      const left = dayDiff(dueDay, today) // >0 sắp đến hạn, <0 quá hạn
      if (left >= 0) {
        const stage = dueSoonStage(left)
        if (!stage) continue
        const rcpts = stage === 'D0' && t.creatorId !== t.assigneeId ? [t.assigneeId, t.creatorId] : [t.assigneeId]
        const msg = stage === 'D3' ? 'Công việc còn 3 ngày đến hạn' : stage === 'D1' ? 'Công việc đến hạn NGÀY MAI' : 'Công việc đến hạn HÔM NAY'
        for (const r of rcpts) {
          out.push({
            ruleKey: 'TASK_DUE_SOON', entityType: 'task', entityId: t.id, recipientId: r, stageKey: stage,
            dedupeKey: `TASK_DUE_SOON:${t.id}:${r}:${dueDay}:${stage}`,
            notifType: 'due_soon', taskId: t.id, payload: { message: msg, stage, dueDay },
          })
        }
      } else {
        const d = -left
        const stage = overdueStage(d)
        if (!stage) continue
        const rcpts = t.creatorId !== t.assigneeId ? [t.assigneeId, t.creatorId] : [t.assigneeId]
        for (const r of rcpts) {
          out.push({
            ruleKey: 'TASK_OVERDUE', entityType: 'task', entityId: t.id, recipientId: r, stageKey: stage,
            dedupeKey: `TASK_OVERDUE:${t.id}:${r}:${dueDay}:${stage}`,
            notifType: 'overdue', taskId: t.id, payload: { message: `Công việc đã quá hạn ${d} ngày`, stage, days: d, dueDay },
          })
        }
      }
    }
    return out
  }

  /** TASK_NOT_STARTED — todo quá N ngày kể từ khi tạo (schema không có startDate bắt buộc → dùng createdAt, ghi rõ). */
  private async taskNotStartedRule(stats: { scanned: number }): Promise<Candidate[]> {
    const tz = this.cfg.timezone
    const today = dayKey(new Date(), tz)
    // Prefilter SQL nới 1 ngày (instant-based); nguồn chân lý là dayDiff theo TZ bên dưới
    // — tránh sót task tạo "N ngày trước theo lịch" nhưng chưa đủ N×24h.
    const threshold = new Date(Date.now() - (this.cfg.notStartedDays - 1) * 86400000)
    const tasks = await this.prisma.task.findMany({
      where: { archived: false, status: 'todo', createdAt: { lte: threshold } },
      select: { id: true, createdAt: true, assigneeId: true },
    })
    stats.scanned += tasks.length
    const out: Candidate[] = []
    for (const t of tasks) {
      const d = dayDiff(today, dayKey(t.createdAt, tz))
      const stages: string[] = []
      if (d >= this.cfg.notStartedDays) stages.push('NS')
      if (d >= 7) stages.push('NS7')
      for (const stage of stages) {
        out.push({
          ruleKey: 'TASK_NOT_STARTED', entityType: 'task', entityId: t.id, recipientId: t.assigneeId, stageKey: stage,
          dedupeKey: `TASK_NOT_STARTED:${t.id}:${t.assigneeId}:${stage}`,
          notifType: 'task_not_started', taskId: t.id,
          payload: { message: `Công việc chưa được bắt đầu sau ${d} ngày`, stage, days: d },
        })
      }
    }
    return out
  }

  /** TASK_WAITING_REVIEW — submitted quá lâu → nhắc reviewer (mốc từ lúc NỘP, lấy từ activity). */
  private async taskWaitingReviewRule(stats: { scanned: number }): Promise<Candidate[]> {
    const tz = this.cfg.timezone
    const today = dayKey(new Date(), tz)
    const tasks = await this.prisma.task.findMany({
      where: { archived: false, status: 'submitted' },
      select: { id: true, reviewerId: true, creatorId: true, assigneeId: true, updatedAt: true },
    })
    stats.scanned += tasks.length
    if (!tasks.length) return []
    // Batch: lần nộp gần nhất từ activities (không N+1)
    const acts = await this.prisma.activity.findMany({
      where: { taskId: { in: tasks.map((t) => t.id) }, action: 'review' },
      select: { taskId: true, createdAt: true, metadata: true },
      orderBy: { createdAt: 'desc' },
    })
    const submittedAt = new Map<string, Date>()
    for (const a of acts) {
      if ((a.metadata as any)?.to === 'submitted' && !submittedAt.has(a.taskId)) submittedAt.set(a.taskId, a.createdAt)
    }
    const out: Candidate[] = []
    for (const t of tasks) {
      const since = submittedAt.get(t.id) ?? t.updatedAt
      const sinceDay = dayKey(since, tz)
      const d = dayDiff(today, sinceDay)
      const stage = waitStage(d, 'W')
      if (!stage) continue
      const reviewer = t.reviewerId ?? t.creatorId // task cũ chưa có reviewer → người giao
      const rcpts = new Set([reviewer])
      if (d >= 3 && t.creatorId !== reviewer) rcpts.add(t.creatorId) // escalation tầng 2
      for (const r of rcpts) {
        out.push({
          ruleKey: 'TASK_WAITING_REVIEW', entityType: 'task', entityId: t.id, recipientId: r, stageKey: stage,
          dedupeKey: `TASK_WAITING_REVIEW:${t.id}:${r}:${sinceDay}:${stage}`,
          notifType: 'review_waiting', taskId: t.id,
          payload: { message: `Công việc chờ nghiệm thu ${d} ngày`, stage, days: d },
        })
      }
    }
    return out
  }

  /** TASK_RETURNED — bị trả lại chưa gửi lại (mốc từ lúc trả lại). Resubmit → status đổi → tự dừng. */
  private async taskReturnedRule(stats: { scanned: number }): Promise<Candidate[]> {
    const tz = this.cfg.timezone
    const today = dayKey(new Date(), tz)
    const tasks = await this.prisma.task.findMany({
      where: { archived: false, status: 'returned' },
      select: { id: true, assigneeId: true, creatorId: true, updatedAt: true },
    })
    stats.scanned += tasks.length
    if (!tasks.length) return []
    const acts = await this.prisma.activity.findMany({
      where: { taskId: { in: tasks.map((t) => t.id) }, action: 'review' },
      select: { taskId: true, createdAt: true, metadata: true },
      orderBy: { createdAt: 'desc' },
    })
    const returnedAt = new Map<string, Date>()
    for (const a of acts) {
      if ((a.metadata as any)?.decision === 'returned' && !returnedAt.has(a.taskId)) returnedAt.set(a.taskId, a.createdAt)
    }
    const out: Candidate[] = []
    for (const t of tasks) {
      const since = returnedAt.get(t.id) ?? t.updatedAt
      const sinceDay = dayKey(since, tz)
      const d = dayDiff(today, sinceDay)
      const stage = waitStage(d, 'R')
      if (!stage) continue
      const rcpts = new Set([t.assigneeId])
      if (d >= 3 && t.creatorId !== t.assigneeId) rcpts.add(t.creatorId)
      for (const r of rcpts) {
        out.push({
          ruleKey: 'TASK_RETURNED', entityType: 'task', entityId: t.id, recipientId: r, stageKey: stage,
          dedupeKey: `TASK_RETURNED:${t.id}:${r}:${sinceDay}:${stage}`,
          notifType: 'returned_pending', taskId: t.id,
          payload: { message: `Công việc bị trả lại ${d} ngày chưa gửi nghiệm thu lại`, stage, days: d },
        })
      }
    }
    return out
  }

  /** ACTION_DUE_SOON + ACTION_OVERDUE + ACTION_EMPTY. */
  private async actionRules(stats: { scanned: number }): Promise<Candidate[]> {
    const tz = this.cfg.timezone
    const today = dayKey(new Date(), tz)
    const emptyThreshold = new Date(Date.now() - (this.cfg.notStartedDays - 1) * 86400000) // day-check bên dưới là chân lý
    const actions = await this.prisma.action.findMany({
      where: { archived: false, status: { in: ACTION_OPEN_STATUSES as any } },
      select: {
        id: true, title: true, deadline: true, ownerId: true, createdById: true, createdAt: true,
        _count: { select: { tasks: true } },
      },
    })
    stats.scanned += actions.length
    const out: Candidate[] = []
    const push = (a: any, ruleKey: string, stage: string, notifType: string, msg: string, keyExtra: string, rcpts: string[], extraPayload: Record<string, unknown> = {}) => {
      for (const r of new Set(rcpts)) {
        out.push({
          ruleKey, entityType: 'action', entityId: a.id, recipientId: r, stageKey: stage,
          dedupeKey: `${ruleKey}:${a.id}:${r}${keyExtra}:${stage}`,
          notifType, actionId: a.id,
          payload: { message: msg, stage, entityTitle: a.title, ...extraPayload },
        })
      }
    }
    for (const a of actions) {
      if (a.deadline) {
        const dlDay = dayKey(a.deadline, tz)
        const left = dayDiff(dlDay, today)
        if (left >= 0) {
          const stage = left === 3 ? 'AD3' : left === 1 ? 'AD1' : left === 0 ? 'AD0' : null
          if (stage) {
            const msg = stage === 'AD3' ? 'Action còn 3 ngày đến deadline' : stage === 'AD1' ? 'Action đến deadline NGÀY MAI' : 'Action đến deadline HÔM NAY'
            push(a, 'ACTION_DUE_SOON', stage, 'action_due_soon', msg, `:${dlDay}`,
              stage === 'AD0' ? [a.ownerId, a.createdById] : [a.ownerId])
          }
        } else {
          const stage = actionOverdueStage(-left)
          if (stage) {
            push(a, 'ACTION_OVERDUE', stage, 'action_overdue', `Action đã quá deadline ${-left} ngày`, `:${dlDay}`,
              [a.ownerId, a.createdById], { days: -left })
          }
        }
      }
      // ACTION_EMPTY — tạo đủ lâu mà chưa có task nào (không deadline vẫn nhắc)
      if (a._count.tasks === 0 && a.createdAt <= emptyThreshold) {
        const d = dayDiff(today, dayKey(a.createdAt, tz))
        if (d < this.cfg.notStartedDays) continue // mới tạo chưa đủ ngưỡng theo NGÀY
        const stages: string[] = ['AE']
        if (d >= 7) stages.push('AE7')
        for (const stage of stages) {
          push(a, 'ACTION_EMPTY', stage, 'action_empty', `Action chưa có công việc triển khai sau ${d} ngày`, '',
            [a.ownerId, a.createdById], { days: d })
        }
      }
    }
    return out
  }
}
