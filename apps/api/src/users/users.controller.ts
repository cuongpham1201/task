import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { UsersService } from './users.service'

@Controller()
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

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

  @Get('users/:id')
  async findOne(@Param('id') id: string) {
    const u = await this.users.findOne(id)
    if (!u) throw new NotFoundException('Không tìm thấy người dùng')
    return u
  }
}
