import {
  Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, UseGuards,
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

class ProvisionDto {
  @IsOptional() @IsString() @Matches(/^[a-z0-9._-]{3,60}$/) username?: string
}
class AccessDto {
  @IsOptional() @IsBoolean() localLoginEnabled?: boolean
  @IsOptional() @IsBoolean() active?: boolean
  @IsOptional() @IsBoolean() unlock?: boolean
}
class RoleDto {
  @IsIn(['admin', 'manager', 'member']) role!: string
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly localAuth: LocalAuthService,
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

  // ── HRM sync ──
  @Get('hrm-sync/logs')
  async syncLogs(@AuthUser() c: AuthClaims) {
    await this.admin(c)
    return this.prisma.syncLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })
  }

  @Post('hrm-sync/run')
  async syncRun(@AuthUser() c: AuthClaims) {
    const actor = await this.admin(c)
    await this.audit(actor.id, null, 'hrm_sync_run', {})
    const script = join(process.cwd(), 'scripts', 'sync-hrm-dev.mjs')
    return new Promise((resolve) => {
      execFile('node', ['--env-file=.env', script], { cwd: process.cwd(), timeout: 180_000 }, (err, stdout, stderr) => {
        resolve({ ok: !err, output: (stdout || '').slice(-2000), error: err ? (stderr || err.message).slice(-500) : null })
      })
    })
  }
}
