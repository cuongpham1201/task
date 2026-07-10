import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import { createReadStream, existsSync } from 'node:fs'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { UsersService } from './users.service'
import { AvatarService } from './avatar.service'

@Controller()
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly avatars: AvatarService,
  ) {}

  /** Hồ sơ người đăng nhập hiện tại (SSO) — dùng để bootstrap frontend. */
  @Get('me')
  async me(@AuthUser() claims: AuthClaims) {
    const u = await this.users.resolveFromClaims(claims)
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      orgUnitId: u.orgUnitId,
      jobTitle: u.jobTitle,
      avatarUrl: u.avatarUrl,
    }
  }

  @Get('users')
  findAll() {
    return this.users.findAll()
  }

  // Autocomplete picker — /users/search?q=&limit=&orgUnitId= (khai báo TRƯỚC :id)
  @Get('users/search')
  searchUsers(
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('orgUnitId') orgUnitId?: string,
  ) {
    return this.users.search(q, limit ? Number(limit) : 20, orgUnitId)
  }

  // Ảnh đại diện M365 (cache disk từ Graph lúc login) — browser cache 1 ngày, không gọi Graph.
  @Get('users/:id/avatar')
  avatar(@Param('id') id: string, @Res() res: Response) {
    const file = this.avatars.pathFor(id)
    if (!existsSync(file)) throw new NotFoundException('Chưa có ảnh đại diện')
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'private, max-age=86400')
    createReadStream(file).pipe(res)
  }

  @Get('users/:id')
  async findOne(@Param('id') id: string) {
    const u = await this.users.findOne(id)
    if (!u) throw new NotFoundException('Không tìm thấy người dùng')
    return u
  }
}
