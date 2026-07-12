import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { UsersService } from '../users/users.service'
import { RemindersService } from './reminders.service'

/**
 * P1-3 — API vận hành Reminder Engine. CHỈ Admin (kiểm server-side).
 * - status: cấu hình + 10 lần chạy gần nhất (runId/counts/durationMs — audit được)
 * - run {dryRun:true}: chỉ đếm, KHÔNG ghi notification
 * - run: manual run — vẫn idempotent (dedupe key), chạy đồng thời cron không trùng
 */
@Controller('admin/reminders')
@UseGuards(AuthGuard)
export class RemindersController {
  constructor(
    private readonly reminders: RemindersService,
    private readonly users: UsersService,
  ) {}

  private async admin(c: AuthClaims) {
    const me = await this.users.resolveFromClaims(c)
    if (me.role !== 'admin') throw new ForbiddenException('Chỉ quản trị viên')
    return me
  }

  @Get('status')
  async status(@AuthUser() c: AuthClaims) {
    await this.admin(c)
    return this.reminders.status()
  }

  @Post('run')
  async run(@AuthUser() c: AuthClaims, @Body() body: { dryRun?: boolean }) {
    await this.admin(c)
    return this.reminders.run({ dryRun: body?.dryRun === true, trigger: 'manual' })
  }
}
