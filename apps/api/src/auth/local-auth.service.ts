import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'

/**
 * FEATURE-001: Local login cho nhân viên KHÔNG có tài khoản/license M365.
 * - Cùng session cookie với Entra (chỉ là phương thức đăng nhập thứ 2 — 1 người = 1 User).
 * - bcrypt hash (cost 10); KHÔNG log/trả password/passwordHash.
 * - Chống brute-force: sai >=5 lần → khóa 15 phút; đăng nhập đúng reset đếm.
 * - Thông điệp lỗi CHUNG — không tiết lộ username tồn tại hay không.
 */
const MAX_FAILED = 5
const LOCK_MINUTES = 15
const GENERIC_FAIL = 'Tên đăng nhập hoặc mật khẩu không đúng'

@Injectable()
export class LocalAuthService {
  constructor(private readonly prisma: PrismaService) {}

  hash(password: string) {
    return bcrypt.hash(password, 10)
  }

  /** Đăng nhập local — trả user khi hợp lệ (controller tự set cookie session chung). */
  async login(usernameOrEmail: string, password: string) {
    const key = (usernameOrEmail || '').trim().toLowerCase()
    if (!key || !password) throw new UnauthorizedException(GENERIC_FAIL)

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: key }, { email: key }] },
    })
    // Mọi nhánh fail dùng CÙNG thông điệp — không lộ user tồn tại
    if (!user || !user.passwordHash) throw new UnauthorizedException(GENERIC_FAIL)
    if (!user.active) throw new UnauthorizedException(GENERIC_FAIL)
    if (!user.localLoginEnabled) throw new UnauthorizedException(GENERIC_FAIL)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException('Tài khoản tạm khóa do đăng nhập sai nhiều lần. Thử lại sau ít phút.')
    }

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      const failed = user.failedLoginCount + 1
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      })
      throw new UnauthorizedException(GENERIC_FAIL)
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    })
    return user
  }

  /** Đổi mật khẩu (user đã đăng nhập). Bắt buộc mật khẩu cũ đúng; không cho dùng lại mật khẩu cũ. */
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user?.passwordHash || !user.localLoginEnabled) {
      throw new BadRequestException('Tài khoản không dùng đăng nhập nội bộ')
    }
    const ok = await bcrypt.compare(oldPassword || '', user.passwordHash)
    if (!ok) throw new UnauthorizedException('Mật khẩu hiện tại không đúng')
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Mật khẩu mới phải từ 8 ký tự')
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException('Mật khẩu mới không được trùng mật khẩu cũ')
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.hash(newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    })
    return { changed: true }
  }
}
