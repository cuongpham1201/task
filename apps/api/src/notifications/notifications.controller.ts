import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { IsArray, IsOptional, IsString } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { UsersService } from '../users/users.service'
import { NotificationsService } from './notifications.service'

class MarkReadDto {
  @IsOptional() @IsArray() @IsString({ each: true })
  ids?: string[]
}

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  @Get()
  async list(@AuthUser() claims: AuthClaims) {
    const me = await this.users.resolveFromClaims(claims)
    return this.notifications.listForUser(me)
  }

  @Get('unread-count')
  async unread(@AuthUser() claims: AuthClaims) {
    const me = await this.users.resolveFromClaims(claims)
    return { count: await this.notifications.unreadCount(me.id) }
  }

  @Post('mark-read')
  async markRead(@AuthUser() claims: AuthClaims, @Body() dto: MarkReadDto) {
    const me = await this.users.resolveFromClaims(claims)
    return this.notifications.markRead(me.id, dto.ids)
  }
}
