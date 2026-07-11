import {
  Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, UseGuards,
} from '@nestjs/common'
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { LocalAuthService } from '../auth/local-auth.service'
import { VisibilityService } from '../common/visibility.service'

class ProvisionDto {
  @IsOptional() @IsString() @Matches(/^[a-z0-9._-]{3,60}$/) username?: string
}
class AccessDto {
  @IsOptional() @IsBoolean() localLoginEnabled?: boolean
  @IsOptional() @IsBoolean() active?: boolean
  @IsOptional() @IsBoolean() unlock?: boolean
}
class RoleDto {
  // FEATURE-004: role kỹ thuật chỉ còn admin/member — "trưởng phòng" là VAI TRÒ
  // TỔ CHỨC (org_unit_roles.department_manager), không phải role kỹ thuật.
  // Enum DB giữ 'manager' để tương thích (0 user đang dùng), API không cho set nữa.
  @IsIn(['admin', 'member']) role!: string
}

// ── FEATURE-003: vai trò tổ chức ──
const ORG_ROLES = ['ceo', 'block_director', 'department_manager', 'viewer'] as const
const ORG_SCOPES = ['self_only', 'include_children'] as const
class OrgRoleCreateDto {
  @IsString() orgUnitId!: string
  @IsIn(ORG_ROLES as unknown as string[]) role!: string
  @IsIn(ORG_SCOPES as unknown as string[]) scope!: string
  @IsOptional() @IsString() @MaxLength(300) note?: string
}
class OrgRoleUpdateDto {
  @IsOptional() @IsString() orgUnitId?: string
  @IsOptional() @IsIn(ORG_ROLES as unknown as string[]) role?: string
  @IsOptional() @IsIn(ORG_SCOPES as unknown as string[]) scope?: string
  @IsOptional() @IsBoolean() active?: boolean
  @IsOptional() @IsString() @MaxLength(300) note?: string
}
class OrgRolePreviewDto {
  @IsString() userId!: string
  @IsString() orgUnitId!: string
  @IsIn(ORG_ROLES as unknown as string[]) role!: string
  @IsIn(ORG_SCOPES as unknown as string[]) scope!: string
}

// Convention (KHÔNG chặn cứng — chỉ cảnh báo, PHẦN 3): role nào thường gắn loại đơn vị nào
const ROLE_UNIT_CONVENTION: Record<string, string> = {
  ceo: 'company',
  block_director: 'block',
  department_manager: 'department',
}
const ORG_ROLE_LABEL: Record<string, string> = {
  ceo: 'Tổng giám đốc', block_director: 'Giám đốc khối', department_manager: 'Trưởng phòng/ban', viewer: 'Người xem',
}

/** Sinh mật khẩu tạm dễ đọc (12 ký tự, không ký tự dễ nhầm). Chỉ trả 1 LẦN, không lưu plaintext. */
function tempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from(randomBytes(12)).map((b) => chars[b % chars.length]).join('')
}

/**
 * FEATURE-001: Quản trị người dùng. TOÀN BỘ endpoint kiểm tra role admin Ở SERVER
 * (không tin frontend). HRM là master cho tên/phòng/chức danh — admin KHÔNG sửa được;
 * chỉ quản lý phương thức đăng nhập/quyền/khóa. Mọi thao tác ghi admin_audit_logs.
 */
@Controller('admin')
@UseGuards(AuthGuard)
export class AdminController {
  private static syncRunning = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly localAuth: LocalAuthService,
    private readonly vis: VisibilityService,
  ) {}

  private async admin(claims: AuthClaims) {
    const me = await this.users.resolveFromClaims(claims)
    if (me.role !== 'admin') throw new ForbiddenException('Chỉ quản trị viên')
    return me
  }

  private audit(actorId: string, targetUserId: string | null, action: string, metadata: Record<string, unknown> = {}) {
    return this.prisma.adminAuditLog.create({ data: { actorId, targetUserId, action, metadata: metadata as any } })
  }

  // Serialize user cho admin — TUYỆT ĐỐI không kèm passwordHash
  private view(u: any, empCode: string | null, orgName: string | null) {
    return {
      id: u.id, displayName: u.displayName, email: u.email, username: u.username,
      empCode, orgUnitId: u.orgUnitId, orgUnitName: orgName, jobTitle: u.jobTitle,
      role: u.role, active: u.active,
      hasEntra: !!u.entraId, hasLocal: !!u.passwordHash && u.localLoginEnabled,
      localLoginEnabled: u.localLoginEnabled, mustChangePassword: u.mustChangePassword,
      locked: !!(u.lockedUntil && u.lockedUntil > new Date()), lockedUntil: u.lockedUntil,
      lastLoginAt: u.lastLoginAt, avatarUrl: u.avatarUrl,
    }
  }

  @Get('users')
  async list(@AuthUser() c: AuthClaims) {
    await this.admin(c)
    const [users, mappings, orgs] = await Promise.all([
      this.prisma.user.findMany({ orderBy: { displayName: 'asc' } }),
      this.prisma.externalUserMapping.findMany({ select: { userId: true, empCode: true } }),
      this.prisma.orgUnit.findMany({ select: { id: true, name: true } }),
    ])
    const emp = new Map(mappings.map((m) => [m.userId, m.empCode]))
    const org = new Map(orgs.map((o) => [o.id, o.name]))
    return users.map((u) => this.view(u, emp.get(u.id) ?? null, u.orgUnitId ? org.get(u.orgUnitId) ?? null : null))
  }

  @Get('users/:id')
  async one(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    await this.admin(c)
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u) throw new NotFoundException('Không tìm thấy người dùng')
    const m = await this.prisma.externalUserMapping.findUnique({ where: { userId: id } })
    const o = u.orgUnitId ? await this.prisma.orgUnit.findUnique({ where: { id: u.orgUnitId } }) : null
    return this.view(u, m?.empCode ?? null, o?.name ?? null)
  }

  /** Cấp tài khoản local: sinh/chọn username + mật khẩu tạm (trả DUY NHẤT 1 lần). */
  @Post('users/:id/provision-local')
  async provision(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: ProvisionDto) {
    const actor = await this.admin(c)
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u) throw new NotFoundException('Không tìm thấy người dùng')
    // username: chọn tay > local-part email công ty > empCode
    const m = await this.prisma.externalUserMapping.findUnique({ where: { userId: id } })
    let username = dto.username?.toLowerCase()
      || (u.email.endsWith('@biahalong.com') ? u.email.split('@')[0] : null)
      || (m?.empCode ? `nv${m.empCode}` : null)
    if (!username) throw new NotFoundException('Không sinh được username — truyền username thủ công')
    const clash = await this.prisma.user.findFirst({ where: { username, NOT: { id } } })
    if (clash) username = `${username}.${(m?.empCode || id.slice(0, 4)).toLowerCase()}`
    const password = tempPassword()
    await this.prisma.user.update({
      where: { id },
      data: {
        username,
        passwordHash: await this.localAuth.hash(password),
        localLoginEnabled: true,
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    })
    await this.audit(actor.id, id, 'provision_local', { username })
    return { username, tempPassword: password } // hiển thị 1 lần — không xem lại được
  }

  @Post('users/:id/reset-password')
  async resetPassword(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    const actor = await this.admin(c)
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u || !u.username) throw new NotFoundException('User chưa có tài khoản local')
    const password = tempPassword()
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await this.localAuth.hash(password), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
    })
    await this.audit(actor.id, id, 'reset_password', {})
    return { username: u.username, tempPassword: password }
  }

  @Patch('users/:id/access')
  async access(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: AccessDto) {
    const actor = await this.admin(c)
    const data: any = {}
    if (dto.localLoginEnabled !== undefined) data.localLoginEnabled = dto.localLoginEnabled
    if (dto.active !== undefined) data.active = dto.active
    if (dto.unlock) { data.lockedUntil = null; data.failedLoginCount = 0 }
    const u = await this.prisma.user.update({ where: { id }, data })
    await this.audit(actor.id, id, 'set_access', { ...dto })
    const m = await this.prisma.externalUserMapping.findUnique({ where: { userId: id } })
    return this.view(u, m?.empCode ?? null, null)
  }

  @Patch('users/:id/roles')
  async role(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: RoleDto) {
    const actor = await this.admin(c)
    if (actor.id === id && dto.role !== 'admin') throw new ForbiddenException('Không tự hạ quyền admin của chính mình')
    const u = await this.prisma.user.update({ where: { id }, data: { role: dto.role as any } })
    await this.audit(actor.id, id, 'set_role', { role: dto.role })
    return { id: u.id, role: u.role }
  }

  @Get('users/:id/audit-log')
  async auditLog(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    await this.admin(c)
    const rows = await this.prisma.adminAuditLog.findMany({
      where: { targetUserId: id }, orderBy: { createdAt: 'desc' }, take: 50,
      include: { actor: { select: { displayName: true } } },
    })
    return rows.map((r) => ({ id: r.id, action: r.action, metadata: r.metadata, actorName: r.actor.displayName, createdAt: r.createdAt }))
  }

  // ══ FEATURE-003: Vai trò tổ chức & phạm vi dữ liệu ══════════════════════
  // App Giao việc TỰ quản quyền nghiệp vụ qua org_unit_roles — HRM chỉ là master
  // danh tính/cây tổ chức. KHÔNG suy quyền từ jobTitle. DELETE = deactivate
  // (archive, giữ lịch sử audit) — KHÔNG hard delete.

  private orgRoleView(r: any) {
    return {
      id: r.id, role: r.role, scope: r.scope, source: r.source, active: r.active,
      note: r.note, createdAt: r.createdAt, updatedAt: r.updatedAt,
      orgUnit: r.orgUnit
        ? { id: r.orgUnit.id, code: r.orgUnit.code, name: r.orgUnit.name, type: r.orgUnit.type, active: r.orgUnit.active }
        : null,
      createdByName: r.createdBy?.displayName ?? null,
    }
  }

  private orgRoleWarnings(role: string, orgUnit: { type: string; name: string; active: boolean }, user?: { active: boolean }) {
    const w: string[] = []
    const expected = ROLE_UNIT_CONVENTION[role]
    if (expected && orgUnit.type !== expected) {
      w.push(`${ORG_ROLE_LABEL[role]} theo convention gắn đơn vị loại "${expected}" — đang chọn "${orgUnit.type}" (${orgUnit.name}). Cho phép nếu nghiệp vụ cần, hãy kiểm tra kỹ.`)
    }
    if (!orgUnit.active) w.push(`Đơn vị "${orgUnit.name}" đang INACTIVE — assignment sẽ KHÔNG mở quyền dữ liệu cho tới khi đơn vị active trở lại.`)
    if (user && !user.active) w.push('Người dùng đang INACTIVE (nghỉ việc/khóa) — assignment được giữ để audit nhưng KHÔNG có hiệu lực.')
    return w
  }

  /** Danh sách org unit cho picker admin (kèm inactive để cảnh báo — bootstrap chỉ có active). */
  @Get('org-units')
  async orgUnits(@AuthUser() c: AuthClaims) {
    await this.admin(c)
    const units = await this.prisma.orgUnit.findMany({
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, type: true, parentId: true, active: true, legalEntity: true },
    })
    return units
  }

  @Get('users/:id/org-roles')
  async orgRoles(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    await this.admin(c)
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u) throw new NotFoundException('Không tìm thấy người dùng')
    const rows = await this.prisma.orgUnitRole.findMany({
      where: { userId: id },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: { orgUnit: true, createdBy: { select: { displayName: true } } },
    })
    return rows.map((r) => this.orgRoleView(r))
  }

  /** Thêm assignment. Trùng tuple active → 409; trùng tuple inactive → TÁI KÍCH HOẠT record cũ. */
  @Post('users/:id/org-roles')
  async orgRoleAdd(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: OrgRoleCreateDto) {
    const actor = await this.admin(c)
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u) throw new NotFoundException('Không tìm thấy người dùng')
    const org = await this.prisma.orgUnit.findUnique({ where: { id: dto.orgUnitId } })
    if (!org) throw new NotFoundException('Không tìm thấy đơn vị tổ chức')

    const result = await this.prisma.$transaction(async (tx) => {
      const dup = await tx.orgUnitRole.findFirst({
        where: { userId: id, orgUnitId: dto.orgUnitId, role: dto.role as any, active: true },
      })
      if (dup) throw new ConflictException('Assignment này đã tồn tại và đang active')
      const inactive = await tx.orgUnitRole.findFirst({
        where: { userId: id, orgUnitId: dto.orgUnitId, role: dto.role as any, active: false },
        orderBy: { updatedAt: 'desc' },
      })
      let row
      let auditAction = 'org_role_add'
      let before: any = null
      if (inactive) {
        auditAction = 'org_role_reactivate'
        before = { role: inactive.role, scope: inactive.scope, orgUnitId: inactive.orgUnitId, active: false, source: inactive.source }
        row = await tx.orgUnitRole.update({
          where: { id: inactive.id },
          data: { active: true, scope: dto.scope as any, note: dto.note ?? inactive.note, source: 'MANUAL', createdById: actor.id },
        })
      } else {
        row = await tx.orgUnitRole.create({
          data: { userId: id, orgUnitId: dto.orgUnitId, role: dto.role as any, scope: dto.scope as any, note: dto.note ?? null, source: 'MANUAL', createdById: actor.id },
        })
      }
      await tx.adminAuditLog.create({
        data: {
          actorId: actor.id, targetUserId: id, action: auditAction,
          metadata: { roleAssignmentId: row.id, before, after: { role: row.role, scope: row.scope, orgUnitId: row.orgUnitId, active: true }, source: row.source, note: dto.note ?? null } as any,
        },
      })
      return row
    })
    const full = await this.prisma.orgUnitRole.findUnique({
      where: { id: result.id }, include: { orgUnit: true, createdBy: { select: { displayName: true } } },
    })
    return { assignment: this.orgRoleView(full), warnings: this.orgRoleWarnings(dto.role, org, u) }
  }

  /** Sửa assignment. Admin sửa record HRM_SYNC → App nhận quyền sở hữu (source→MANUAL) để sync không ghi đè. */
  @Patch('users/:id/org-roles/:roleId')
  async orgRoleUpdate(@AuthUser() c: AuthClaims, @Param('id') id: string, @Param('roleId') roleId: string, @Body() dto: OrgRoleUpdateDto) {
    const actor = await this.admin(c)
    const row = await this.prisma.orgUnitRole.findFirst({ where: { id: roleId, userId: id }, include: { orgUnit: true } })
    if (!row) throw new NotFoundException('Không tìm thấy assignment')
    const nextOrgId = dto.orgUnitId ?? row.orgUnitId
    const nextRole = dto.role ?? row.role
    const nextActive = dto.active ?? row.active
    const org = await this.prisma.orgUnit.findUnique({ where: { id: nextOrgId } })
    if (!org) throw new NotFoundException('Không tìm thấy đơn vị tổ chức')

    const updated = await this.prisma.$transaction(async (tx) => {
      if (nextActive) {
        const dup = await tx.orgUnitRole.findFirst({
          where: { userId: id, orgUnitId: nextOrgId, role: nextRole as any, active: true, NOT: { id: roleId } },
        })
        if (dup) throw new ConflictException('Đã có assignment active trùng (user + đơn vị + vai trò)')
      }
      const before = { role: row.role, scope: row.scope, orgUnitId: row.orgUnitId, active: row.active, source: row.source, note: row.note }
      const r = await tx.orgUnitRole.update({
        where: { id: roleId },
        data: {
          orgUnitId: nextOrgId, role: nextRole as any,
          scope: (dto.scope ?? row.scope) as any, active: nextActive,
          note: dto.note !== undefined ? dto.note : row.note,
          source: 'MANUAL', // admin đã đụng tay → App sở hữu, HRM sync không quản record này nữa
        },
      })
      const action = dto.active === false ? 'org_role_deactivate' : dto.active === true && !row.active ? 'org_role_reactivate' : 'org_role_update'
      await tx.adminAuditLog.create({
        data: {
          actorId: actor.id, targetUserId: id, action,
          metadata: { roleAssignmentId: roleId, before, after: { role: r.role, scope: r.scope, orgUnitId: r.orgUnitId, active: r.active, source: r.source, note: r.note } } as any,
        },
      })
      return r
    })
    const full = await this.prisma.orgUnitRole.findUnique({
      where: { id: updated.id }, include: { orgUnit: true, createdBy: { select: { displayName: true } } },
    })
    const u = await this.prisma.user.findUnique({ where: { id } })
    return { assignment: this.orgRoleView(full), warnings: this.orgRoleWarnings(String(nextRole), org, u ?? undefined) }
  }

  /** DELETE = deactivate/archive (giữ lịch sử audit) — KHÔNG hard delete. */
  @Delete('users/:id/org-roles/:roleId')
  async orgRoleArchive(@AuthUser() c: AuthClaims, @Param('id') id: string, @Param('roleId') roleId: string) {
    const actor = await this.admin(c)
    const row = await this.prisma.orgUnitRole.findFirst({ where: { id: roleId, userId: id } })
    if (!row) throw new NotFoundException('Không tìm thấy assignment')
    await this.prisma.$transaction(async (tx) => {
      await tx.orgUnitRole.update({ where: { id: roleId }, data: { active: false, source: 'MANUAL' } })
      await tx.adminAuditLog.create({
        data: {
          actorId: actor.id, targetUserId: id, action: 'org_role_deactivate',
          metadata: { roleAssignmentId: roleId, before: { role: row.role, scope: row.scope, orgUnitId: row.orgUnitId, active: row.active, source: row.source }, after: { active: false } } as any,
        },
      })
    })
    return { id: roleId, active: false, archived: true }
  }

  /** Phạm vi hiệu lực hiện tại của user (tính bằng ĐÚNG engine backend). */
  @Get('users/:id/effective-scope')
  async effectiveScope(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    await this.admin(c)
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u) throw new NotFoundException('Không tìm thấy người dùng')
    const warnings: string[] = []
    if (!u.active) {
      // PHẦN 11: user inactive → không có effective permission (assignment giữ để audit)
      warnings.push('Người dùng INACTIVE — không đăng nhập được và mọi assignment KHÔNG có hiệu lực.')
      return { visibleOrgUnitIds: [], manageableOrgUnitIds: [], orgUnits: [], permissions: { isAdmin: false, hasOrgRole: false, canViewActionLog: false, canManageActions: false, canViewReports: false, managedOrgUnitIds: [] }, warnings }
    }
    const me = { id: u.id, role: u.role, orgUnitId: u.orgUnitId }
    const [visible, managed, permissions] = await Promise.all([
      this.vis.visibleOrgUnitIds(me), this.vis.managedOrgUnitIds(me), this.vis.effectivePermissions(me),
    ])
    const units = await this.prisma.orgUnit.findMany({
      where: { id: { in: visible } }, select: { id: true, code: true, name: true, type: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    })
    return { visibleOrgUnitIds: visible, manageableOrgUnitIds: managed, orgUnits: units, permissions, warnings }
  }

  /** Preview phạm vi TRƯỚC KHI LƯU assignment — cùng thuật toán engine (không tính lại ở FE). */
  @Post('org-role-preview')
  async orgRolePreview(@AuthUser() c: AuthClaims, @Body() dto: OrgRolePreviewDto) {
    await this.admin(c)
    const u = await this.prisma.user.findUnique({ where: { id: dto.userId } })
    if (!u) throw new NotFoundException('Không tìm thấy người dùng')
    const org = await this.prisma.orgUnit.findUnique({ where: { id: dto.orgUnitId } })
    if (!org) throw new NotFoundException('Không tìm thấy đơn vị tổ chức')

    const me = { id: u.id, role: u.role, orgUnitId: u.orgUnitId }
    const [currentVisible, currentManaged, addedIds] = await Promise.all([
      this.vis.visibleOrgUnitIds(me),
      this.vis.managedOrgUnitIds(me),
      org.active ? this.vis.expandScope(dto.orgUnitId, dto.scope) : Promise.resolve([]),
    ])
    const visible = [...new Set([...currentVisible, ...addedIds])]
    const manageable = dto.role === 'viewer' ? currentManaged : [...new Set([...currentManaged, ...addedIds])]
    const units = await this.prisma.orgUnit.findMany({
      where: { id: { in: [...new Set([...visible, ...manageable])] } },
      select: { id: true, code: true, name: true, type: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    })
    return {
      visibleOrgUnitIds: visible,
      manageableOrgUnitIds: manageable,
      addedOrgUnitIds: addedIds,
      orgUnits: units,
      warnings: this.orgRoleWarnings(dto.role, org, u),
    }
  }

  // ── HRM sync ──
  @Get('hrm-sync/logs')
  async syncLogs(@AuthUser() c: AuthClaims) {
    await this.admin(c)
    return this.prisma.syncLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })
  }

  @Post('hrm-sync/run')
  async syncRun(@AuthUser() c: AuthClaims) {
    const actor = await this.admin(c)
    // FINAL-REVIEW: sync-hrm-dev đọc HRM DEV — CẤM chạy ở production (chỉ xem log).
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Đồng bộ HRM dev bị khóa ở production — chỉ xem log')
    }
    // Concurrency lock: 2 admin bấm cùng lúc → chỉ 1 sync chạy
    if (AdminController.syncRunning) {
      throw new ForbiddenException('Đồng bộ đang chạy — chờ hoàn tất')
    }
    AdminController.syncRunning = true
    await this.audit(actor.id, null, 'hrm_sync_run', {})
    const script = join(process.cwd(), 'scripts', 'sync-hrm-dev.mjs')
    return new Promise((resolve) => {
      execFile('node', ['--env-file=.env', script], { cwd: process.cwd(), timeout: 180_000 }, (err, stdout, stderr) => {
        AdminController.syncRunning = false
        resolve({ ok: !err, output: (stdout || '').slice(-2000), error: err ? (stderr || err.message).slice(-500) : null })
      })
    })
  }
}
