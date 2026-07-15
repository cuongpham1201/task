import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { parseAsanaJson } from './asana-parser'
import { csvTaskEmails } from './asana-csv'
import { normalize, type NormalizeResult } from './asana-normalizer'
import { buildPlan, type ImportConfig, type ImportPlan, type PlanContext, type PlanItem } from './import-planner'
import { sanitizeConfig, referencedUserIds, referencedOrgIds, referencedSectionIds } from './import-config'
import { IMPORT_LIMITS, IMPORT_SOURCE } from './import.constants'

const dateOnly = (s: string | null): Date | undefined => (s ? new Date(s + 'T00:00:00Z') : undefined)
const ts = (s: string | null): Date | undefined => (s ? new Date(s) : undefined)

interface ExecuteOptions {
  createProject?: { name: string; memberIds?: string[] } | null
}

/**
 * P1-6 — Import Asana JSON. Chỉ Admin (controller kiểm). 3 pha:
 *  parse → lưu batch(parsed) + normalizedJson; preview → dry-run (buildPlan, KHÔNG ghi
 *  Task/Subtask/mapping/notification); execute → revalidate + ghi thật trong transaction,
 *  idempotent theo gid, suppress notification, ghi audit.
 */
@Injectable()
export class ImportService {
  private readonly log = new Logger('AsanaImport')
  constructor(private readonly prisma: PrismaService) {}

  private hash(s: string): string {
    return createHash('sha256').update(s).digest('hex')
  }

  private capNormalized(n: NormalizeResult): NormalizeResult {
    if (n.tasks.length > IMPORT_LIMITS.MAX_ENTITIES) {
      throw new BadRequestException(`Quá nhiều mục (${n.tasks.length} > ${IMPORT_LIMITS.MAX_ENTITIES}).`)
    }
    return n
  }

  /** PHA 1 — parse + normalize + tạo batch. Trả summary/projects/users/customFields cho wizard.
   *  rawCsv (tùy chọn): CSV export Asana → ghép theo Task ID lấy email → gợi ý map người. */
  async parse(meId: string, rawJson: string, rawCsv?: string | null) {
    let parsed
    try {
      parsed = parseAsanaJson(rawJson)
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'JSON không hợp lệ')
    }
    const normalized = this.capNormalized(normalize(parsed.data))
    let csvMatched = 0
    if (rawCsv && rawCsv.trim()) {
      const emailByTaskGid = csvTaskEmails(rawCsv)
      const gidEmail: Record<string, string> = {}
      for (const t of normalized.tasks) {
        if (t.assigneeGid) { const e = emailByTaskGid[t.gid]; if (e && !gidEmail[t.assigneeGid]) gidEmail[t.assigneeGid] = e }
      }
      const emails = [...new Set(Object.values(gidEmail))]
      const appUsers = emails.length
        ? await this.prisma.user.findMany({ where: { email: { in: emails }, active: true }, select: { id: true, email: true } })
        : []
      const byEmail = new Map(appUsers.map((u) => [u.email.toLowerCase(), u.id]))
      for (const u of normalized.users) {
        const e = gidEmail[u.gid]
        if (!e) continue
        u.email = e
        const id = byEmail.get(e.toLowerCase())
        if (id) { u.suggestedUserId = id; u.suggestedBy = 'email'; csvMatched++ }
      }
    }
    const payloadHash = this.hash(rawJson)

    const batch = await this.prisma.externalImportBatch.create({
      data: {
        source: IMPORT_SOURCE,
        status: 'parsed',
        importedById: meId,
        payloadHash,
        normalizedJson: normalized as any,
        totalItems: normalized.tasks.length,
      },
      select: { id: true },
    })

    return {
      batchId: batch.id,
      summary: normalized.summary,
      projects: normalized.projects,
      users: normalized.users,
      customFields: normalized.customFields,
      sections: normalized.sections,
      sectionsByProject: normalized.sectionsByProject,
      csvMatched, // số user khớp email từ CSV (0 nếu không nạp CSV)
      warnings: normalized.warnings.slice(0, 200),
    }
  }

  private async loadBatch(meId: string, isAdmin: boolean, batchId: string) {
    const batch = await this.prisma.externalImportBatch.findUnique({ where: { id: batchId } })
    if (!batch) throw new NotFoundException('Không tìm thấy phiên import')
    if (!isAdmin && batch.importedById !== meId) throw new ForbiddenException('Không có quyền với phiên import này')
    if (!batch.normalizedJson) throw new BadRequestException('Phiên import đã hết dữ liệu chuẩn hoá — parse lại.')
    return batch
  }

  /** Nạp context + validate tham chiếu config (dùng chung preview/execute). */
  private async buildContext(cfg: ImportConfig, normalized: NormalizeResult, resolvedTargetProjectId: string | null): Promise<PlanContext> {
    if (!cfg.sourceProjectGid || !normalized.projects.some((p) => p.gid === cfg.sourceProjectGid)) {
      throw new BadRequestException('Chưa chọn dự án Asana nguồn hợp lệ')
    }
    if (cfg.defaultAssigneeId) {
      const u = await this.prisma.user.findUnique({ where: { id: cfg.defaultAssigneeId }, select: { active: true } })
      if (!u?.active) throw new BadRequestException('Người thực hiện mặc định không hợp lệ')
    }
    if (resolvedTargetProjectId) {
      const ws = await this.prisma.workspace.findUnique({ where: { id: resolvedTargetProjectId }, select: { type: true, archived: true } })
      if (!ws || ws.type !== 'project' || ws.archived) throw new BadRequestException('Dự án đích không hợp lệ')
    }
    let defaultOrgUnitId: string | null = null
    // defaultOrgUnitId nằm trong config? (đọc từ overrides không; ta truyền riêng qua cfg? — dùng field riêng)
    defaultOrgUnitId = (cfg as any).defaultOrgUnitId ?? null
    if (defaultOrgUnitId) {
      const ou = await this.prisma.orgUnit.findUnique({ where: { id: defaultOrgUnitId }, select: { active: true } })
      if (!ou?.active) throw new BadRequestException('Đơn vị mặc định không hợp lệ')
    }
    // Đơn vị map theo section (dạng project=Khối) — mọi org id phải tồn tại + active.
    const orgIds = referencedOrgIds(cfg)
    if (orgIds.length) {
      const found = await this.prisma.orgUnit.findMany({ where: { id: { in: orgIds }, active: true }, select: { id: true } })
      if (found.length !== orgIds.length) throw new BadRequestException('Có đơn vị (map theo section) không hợp lệ hoặc đã ngừng hoạt động')
    }
    // Section (danh sách chung) map từ Asana section — phải tồn tại + active.
    const sectionIds = referencedSectionIds(cfg)
    if (sectionIds.length) {
      const found = await this.prisma.section.findMany({ where: { id: { in: sectionIds }, active: true }, select: { id: true } })
      if (found.length !== sectionIds.length) throw new BadRequestException('Có Section không hợp lệ hoặc đã ẩn')
    }

    const refIds = referencedUserIds(cfg)
    const activeUsers = refIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: refIds }, active: true }, select: { id: true, orgUnitId: true } })
      : []
    const activeUserIds = new Set(activeUsers.map((u) => u.id))
    const userOrgUnit = Object.fromEntries(activeUsers.map((u) => [u.id, u.orgUnitId])) // cho orgFromAssignee

    const gids = normalized.tasks.map((t) => t.gid)
    const existing = gids.length
      ? await this.prisma.externalEntityMapping.findMany({
          where: { source: IMPORT_SOURCE, externalId: { in: gids } },
          select: { externalId: true },
        })
      : []
    const existingGids = new Set(existing.map((e) => e.externalId))

    return { activeUserIds, userOrgUnit, existingGids, targetProjectId: resolvedTargetProjectId, defaultOrgUnitId }
  }

  /** PHA 2 — dry-run. KHÔNG ghi Task/Subtask/mapping/notification. Ghi mappingJson+counts vào batch. */
  async preview(meId: string, isAdmin: boolean, batchId: string, rawConfig: any, defaultOrgUnitId: string | null, targetProjectId: string | null) {
    const batch = await this.loadBatch(meId, isAdmin, batchId)
    const normalized = batch.normalizedJson as unknown as NormalizeResult
    const cfg = sanitizeConfig(rawConfig)
    ;(cfg as any).defaultOrgUnitId = defaultOrgUnitId // truyền org mặc định qua context

    const ctx = await this.buildContext(cfg, normalized, targetProjectId)
    const plan = buildPlan(normalized, cfg, ctx)

    await this.prisma.externalImportBatch.update({
      where: { id: batchId },
      data: {
        status: 'ready',
        sourceProjectId: cfg.sourceProjectGid,
        sourceProjectName: normalized.projects.find((p) => p.gid === cfg.sourceProjectGid)?.name ?? null,
        targetProjectId: targetProjectId ?? null,
        defaultOrgUnitId: defaultOrgUnitId ?? null,
        mappingJson: cfg as any,
        createdCount: plan.summary.createTasks + plan.summary.createSubtasks,
        skippedCount: plan.summary.skipped + plan.summary.existing,
        failedCount: plan.summary.errors,
        warningCount: plan.summary.warnings,
      },
    })

    return { batchId, plan: { items: plan.items, summary: plan.summary }, projects: normalized.projects }
  }

  /** PHA 3 — ghi thật. Revalidate hoàn toàn (không tin plan FE). Idempotent + suppress notif + audit. */
  async execute(meId: string, isAdmin: boolean, batchId: string, rawConfig: any, defaultOrgUnitId: string | null, targetProjectIdIn: string | null, options: ExecuteOptions) {
    const batch = await this.loadBatch(meId, isAdmin, batchId)
    if (batch.status === 'running') throw new BadRequestException('Phiên import đang chạy')
    const normalized = batch.normalizedJson as unknown as NormalizeResult
    const cfg = sanitizeConfig(rawConfig)
    ;(cfg as any).defaultOrgUnitId = defaultOrgUnitId

    // Tạo dự án đích mới (nếu chọn) — owner = người import; thêm thành viên.
    let targetProjectId = targetProjectIdIn
    if (!targetProjectId && options.createProject?.name?.trim()) {
      const memberIds = [...new Set((options.createProject.memberIds || []).filter((x) => typeof x === 'string'))]
      const validMembers = memberIds.length
        ? (await this.prisma.user.findMany({ where: { id: { in: memberIds }, active: true }, select: { id: true } })).map((u) => u.id)
        : []
      const ws = await this.prisma.workspace.create({
        data: {
          type: 'project',
          name: options.createProject.name.trim().slice(0, 255),
          ownerId: meId,
          members: {
            create: [
              { userId: meId, role: 'owner', addedById: meId },
              ...validMembers.filter((id) => id !== meId).map((id) => ({ userId: id, role: 'member', addedById: meId })),
            ],
          },
        },
        select: { id: true },
      })
      targetProjectId = ws.id
    }

    // An toàn: không có dự án đích LẪN đơn vị → task sẽ thành việc cá nhân riêng tư (chỉ người tạo thấy).
    // Import theo phòng ban thì bắt buộc có đơn vị; import theo dự án thì có project.
    if (!targetProjectId && !defaultOrgUnitId) {
      throw new BadRequestException('Chọn dự án đích HOẶC đơn vị chịu trách nhiệm (nếu không, task sẽ thành việc cá nhân riêng tư).')
    }

    const ctx = await this.buildContext(cfg, normalized, targetProjectId)
    const plan = buildPlan(normalized, cfg, ctx)

    // "Người giao" (creatorId) — mặc định người import; hoặc = người thực hiện; hoặc 1 người cố định.
    if (cfg.creatorSource === 'fixed' && (!cfg.fixedCreatorId || !ctx.activeUserIds.has(cfg.fixedCreatorId))) {
      throw new BadRequestException('Người giao cố định không hợp lệ hoặc đã ngừng hoạt động')
    }
    const creatorOf = (assigneeId: string | null): string =>
      cfg.creatorSource === 'assignee' ? (assigneeId || meId) : cfg.creatorSource === 'fixed' ? (cfg.fixedCreatorId || meId) : meId

    await this.prisma.externalImportBatch.update({
      where: { id: batchId },
      data: { status: 'running', startedAt: new Date(), targetProjectId: targetProjectId ?? null, defaultOrgUnitId: defaultOrgUnitId ?? null, mappingJson: cfg as any, sourceProjectId: cfg.sourceProjectGid },
    })

    // Rule "Đã hoàn thành": task import done mà chưa có Section → gán vào section done-bucket.
    const doneBucket = await this.prisma.section.findFirst({ where: { isDoneBucket: true, active: true }, select: { id: true } })

    const gidToTaskId = new Map<string, string>() // gid task tạo trong phiên → task.id
    let created = 0
    let createdSubtasks = 0
    let failed = 0
    const errors: string[] = []

    // ── Tạo TASK (mỗi task 1 transaction: task + watchers + activity + mapping) ──
    const taskItems = plan.items.filter((i) => i.kind === 'task' && i.action === 'create')
    for (const item of taskItems) {
      try {
        const taskId = await this.prisma.$transaction(async (tx) => {
          const t = await tx.task.create({
            data: {
              title: item.title,
              description: item.description,
              orgUnitId: item.orgUnitId,
              projectId: targetProjectId,
              workspaceId: targetProjectId, // project == workspace container
              actionId: null,
              sectionId: item.sectionId ?? (item.status === 'done' ? doneBucket?.id ?? null : null),
              creatorId: creatorOf(item.assigneeId), // "người giao" theo cấu hình (JSON không có người tạo)
              assigneeId: item.assigneeId!, // task 'create' luôn có assignee (plan đảm bảo)
              status: item.status,
              reviewRequired: false,
              reviewerId: null,
              isDraft: false,
              priority: item.priority,
              startDate: dateOnly(item.startOn),
              dueDate: dateOnly(item.dueOn),
              completedAt: item.status === 'done' ? ts(item.completedAt) : undefined,
              archived: false,
              createdAt: ts(item.sourceCreatedAt), // giữ mốc gốc Asana (quyết định người dùng)
            },
            select: { id: true },
          })
          if (item.watcherIds.length) {
            await tx.taskWatcher.createMany({ data: item.watcherIds.map((uid) => ({ taskId: t.id, userId: uid })), skipDuplicates: true })
          }
          // Activity audit — KHÔNG tạo notification (suppress mass-notify khi import)
          await tx.activity.create({ data: { taskId: t.id, userId: meId, action: 'create', metadata: { source: 'asana-import', batchId, sourceGid: item.gid } } })
          await tx.externalEntityMapping.create({
            data: {
              source: IMPORT_SOURCE, entityType: 'task', externalId: item.gid, internalId: t.id,
              importBatchId: batchId, sourceUrl: item.permalink, sourceCreatedAt: ts(item.sourceCreatedAt) ?? null, payloadHash: batch.payloadHash,
            },
          })
          return t.id
        })
        gidToTaskId.set(item.gid, taskId)
        created++
      } catch (e: any) {
        failed++
        if (errors.length < 50) errors.push(`Task ${item.gid}: ${e?.code === 'P2002' ? 'đã tồn tại (trùng)' : e?.message || 'lỗi'}`)
      }
    }

    // ── Tạo SUBTASK (parent = task đã tạo trong phiên HOẶC mapping đã có trước) ──
    const subItems = plan.items.filter((i) => i.kind === 'subtask' && i.action === 'create')
    for (const item of subItems) {
      try {
        let parentTaskId = item.parentGid ? gidToTaskId.get(item.parentGid) : undefined
        if (!parentTaskId && item.parentGid) {
          const m = await this.prisma.externalEntityMapping.findFirst({ where: { source: IMPORT_SOURCE, entityType: 'task', externalId: item.parentGid }, select: { internalId: true } })
          parentTaskId = m?.internalId
        }
        if (!parentTaskId) {
          failed++
          if (errors.length < 50) errors.push(`Subtask ${item.gid}: không tìm thấy task cha`)
          continue
        }
        await this.prisma.$transaction(async (tx) => {
          const s = await tx.subtask.create({
            data: {
              taskId: parentTaskId!, title: item.title, done: item.status === 'done',
              assigneeId: item.assigneeId, createdAt: ts(item.sourceCreatedAt) ?? undefined,
            },
            select: { id: true },
          })
          await tx.externalEntityMapping.create({
            data: { source: IMPORT_SOURCE, entityType: 'subtask', externalId: item.gid, internalId: s.id, importBatchId: batchId, sourceUrl: item.permalink, sourceCreatedAt: ts(item.sourceCreatedAt) ?? null, payloadHash: batch.payloadHash },
          })
        })
        createdSubtasks++
      } catch (e: any) {
        failed++
        if (errors.length < 50) errors.push(`Subtask ${item.gid}: ${e?.code === 'P2002' ? 'đã tồn tại (trùng)' : e?.message || 'lỗi'}`)
      }
    }

    const skipped = plan.summary.skipped + plan.summary.existing
    const warnings = plan.summary.warnings
    const status = failed > 0 ? (created + createdSubtasks > 0 ? 'partial' : 'failed') : 'completed'

    await this.prisma.externalImportBatch.update({
      where: { id: batchId },
      data: {
        status, targetProjectId: targetProjectId ?? null,
        createdCount: created + createdSubtasks, skippedCount: skipped, failedCount: failed, warningCount: warnings,
        completedAt: new Date(), errorSummary: errors.length ? errors.slice(0, 50).join('\n') : null,
      },
    })

    // Audit quản trị (KHÔNG log toàn bộ JSON)
    await this.prisma.adminAuditLog.create({
      data: {
        actorId: meId, action: 'asana_import',
        metadata: { batchId, sourceProjectId: cfg.sourceProjectGid, targetProjectId, created, createdSubtasks, skipped, failed, warnings },
      },
    })

    return { batchId, status, created, createdSubtasks, skipped, failed, warnings, targetProjectId, errors: errors.slice(0, 50) }
  }

  /**
   * Hoàn tác 1 batch: xóa CHÍNH XÁC các task/việc con đã tạo bởi batch (theo mapping),
   * cascade xóa activity/watcher/comment... KHÔNG xóa dự án đích (không chắc do batch tạo).
   */
  async rollback(meId: string, isAdmin: boolean, batchId: string) {
    const batch = await this.loadBatchMeta(meId, isAdmin, batchId)
    if (batch.status === 'running') throw new BadRequestException('Batch đang chạy')
    const maps = await this.prisma.externalEntityMapping.findMany({ where: { importBatchId: batchId }, select: { entityType: true, internalId: true } })
    const taskIds = maps.filter((m) => m.entityType === 'task').map((m) => m.internalId)
    const subtaskIds = maps.filter((m) => m.entityType === 'subtask').map((m) => m.internalId)

    let deletedTasks = 0
    let deletedSubtasks = 0
    await this.prisma.$transaction(async (tx) => {
      await tx.externalEntityMapping.deleteMany({ where: { importBatchId: batchId } })
      if (subtaskIds.length) deletedSubtasks = (await tx.subtask.deleteMany({ where: { id: { in: subtaskIds } } })).count
      if (taskIds.length) deletedTasks = (await tx.task.deleteMany({ where: { id: { in: taskIds } } })).count // cascade: subtask/watcher/comment/activity...
      await tx.externalImportBatch.update({ where: { id: batchId }, data: { status: 'rolledback', createdCount: 0, errorSummary: `Hoàn tác: xóa ${deletedTasks} task + ${deletedSubtasks} việc con` } })
    })
    await this.prisma.adminAuditLog.create({ data: { actorId: meId, action: 'asana_import_rollback', metadata: { batchId, deletedTasks, deletedSubtasks } } })
    return { batchId, deletedTasks, deletedSubtasks }
  }

  private async loadBatchMeta(meId: string, isAdmin: boolean, batchId: string) {
    const batch = await this.prisma.externalImportBatch.findUnique({ where: { id: batchId }, select: { id: true, status: true, importedById: true } })
    if (!batch) throw new NotFoundException('Không tìm thấy phiên import')
    if (!isAdmin && batch.importedById !== meId) throw new ForbiddenException('Không có quyền với phiên import này')
    return batch
  }

  /** Lịch sử batch (mới nhất trước). */
  async listBatches(limit = 30) {
    const rows = await this.prisma.externalImportBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      select: {
        id: true, source: true, status: true, sourceProjectName: true, targetProjectId: true,
        totalItems: true, createdCount: true, skippedCount: true, failedCount: true, warningCount: true,
        startedAt: true, completedAt: true, createdAt: true, importedById: true,
      },
    })
    return rows
  }

  async getBatch(id: string) {
    const b = await this.prisma.externalImportBatch.findUnique({
      where: { id },
      select: {
        id: true, source: true, status: true, sourceProjectId: true, sourceProjectName: true, targetProjectId: true,
        defaultOrgUnitId: true, totalItems: true, createdCount: true, skippedCount: true, failedCount: true,
        warningCount: true, startedAt: true, completedAt: true, errorSummary: true, createdAt: true, importedById: true,
        mappingJson: true,
      },
    })
    if (!b) throw new NotFoundException('Không tìm thấy phiên import')
    return b
  }
}
