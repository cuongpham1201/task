import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { AuthClaims } from '../auth/auth.types'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      where: { active: true },
      orderBy: { displayName: 'asc' },
    })
  }

  findOne(id: string) {
    return this.prisma.user.findUnique({ where: { id } })
  }

  /**
   * Phân giải người dùng nội bộ từ claims token:
   *  - ưu tiên khớp entraId (oid);
   *  - fallback email; nếu khớp email mà chưa có entraId thì backfill (lần đăng nhập đầu).
   *  - CHƯA có → TỰ TẠO user role `member` (auto-provision, hướng B). HRM sync sau này
   *    bổ sung department/role/emp_code qua external_user_mappings (Phase S4).
   */
  async resolveFromClaims(claims: AuthClaims) {
    if (!claims || (!claims.oid && !claims.email)) {
      throw new UnauthorizedException('Token không chứa danh tính (oid/email)')
    }

    let user = claims.oid
      ? await this.prisma.user.findUnique({ where: { entraId: claims.oid } })
      : null

    if (!user && claims.email) {
      user = await this.prisma.user.findUnique({ where: { email: claims.email } })
      if (user && claims.oid && !user.entraId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { entraId: claims.oid },
        })
      }
    }

    if (!user) {
      if (!claims.email) {
        throw new UnauthorizedException('Token không có email để tạo tài khoản')
      }
      try {
        user = await this.prisma.user.create({
          data: {
            entraId: claims.oid ?? null,
            email: claims.email,
            displayName: claims.name || claims.email,
            role: 'member',
          },
        })
      } catch {
        // Trùng do đăng nhập đồng thời → đọc lại theo email.
        user = await this.prisma.user.findUnique({ where: { email: claims.email } })
        if (!user) throw new UnauthorizedException('Không tạo được tài khoản')
      }
    }
    if (!user.active) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa')
    }
    return user
  }
}
