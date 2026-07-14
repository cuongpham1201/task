import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'

class CreateSectionDto {
  @IsString() @MaxLength(120) name!: string
  @IsOptional() @IsInt() sortOrder?: number
}
class UpdateSectionDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string
  @IsOptional() @IsInt() sortOrder?: number
  @IsOptional() @IsBoolean() active?: boolean
  @IsOptional() @IsBoolean() isDoneBucket?: boolean
}

/**
 * "Section" (nhóm sắp xếp) — danh sách CHUNG toàn hệ thống. Đọc: mọi user (để chọn).
 * Tạo/sửa/ẩn: CHỈ Admin (kiểm server-side như các endpoint admin khác).
 */
@Controller('sections')
@UseGuards(AuthGuard)
export class SectionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  private async admin(c: AuthClaims) {
    const me = await this.users.resolveFromClaims(c)
    if (me.role !== 'admin') throw new ForbiddenException('Chỉ quản trị viên')
    return me
  }

  // Mặc định trả section active; admin có thể xem cả ẩn với ?all=1 (để quản lý)
  @Get()
  async list(@AuthUser() c: AuthClaims, @Query('all') all?: string) {
    let includeInactive = false
    if (all === '1') {
      const me = await this.users.resolveFromClaims(c)
      includeInactive = me.role === 'admin'
    }
    return this.prisma.section.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  }

  @Post()
  async create(@AuthUser() c: AuthClaims, @Body() dto: CreateSectionDto) {
    const me = await this.admin(c)
    return this.prisma.section.create({
      data: { name: dto.name.trim(), sortOrder: dto.sortOrder ?? 0, createdById: me.id },
    })
  }

  @Patch(':id')
  async update(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: UpdateSectionDto) {
    await this.admin(c)
    // "Mục Hoàn thành" chỉ MỘT section active — set true thì bỏ đánh dấu các section khác.
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDoneBucket === true) {
        await tx.section.updateMany({ where: { isDoneBucket: true, NOT: { id } }, data: { isDoneBucket: false } })
      }
      return tx.section.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.isDoneBucket !== undefined ? { isDoneBucket: dto.isDoneBucket } : {}),
        },
      })
    })
  }

  // Ẩn (soft) — giữ lịch sử; task đang gắn vẫn giữ (FK SET NULL chỉ khi xóa cứng).
  @Delete(':id')
  async remove(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    await this.admin(c)
    await this.prisma.section.update({ where: { id }, data: { active: false } })
    return { archived: true }
  }
}
