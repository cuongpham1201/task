import { Body, Controller, ForbiddenException, Get, Patch, Post, UseGuards } from '@nestjs/common'
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { UsersService } from '../users/users.service'
import { RemindersService } from './reminders.service'

// P1-4: chỉ field whitelist (forbidNonWhitelisted global → field lạ 400); giới hạn an toàn.
class ReminderSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(5) @Max(1440) intervalMinutes?: number
  @IsOptional() @IsIn(['Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'UTC']) timezone?: string
  @IsOptional() @IsInt() @Min(1) @Max(14) dueSoonDays?: number
  @IsOptional() @IsInt() @Min(1) @Max(30) notStartedDays?: number
  @IsOptional() @IsInt() @Min(1) @Max(30) reviewWaitDays?: number
  @IsOptional() @IsInt() @Min(1) @Max(30) returnedWaitDays?: number
}

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

  // P1-4: form settings (value/source/default/limit) — không expose env ngoài whitelist
  @Get('settings')
  async settings(@AuthUser() c: AuthClaims) {
    await this.admin(c)
    return this.reminders.settings()
  }

  // P1-4: lưu override → DB (audit before/after) + áp runtime NGAY (timer hủy-tạo lại)
  @Patch('settings')
  async saveSettings(@AuthUser() c: AuthClaims, @Body() dto: ReminderSettingsDto) {
    const me = await this.admin(c)
    return this.reminders.updateSettings(me.id, dto)
  }

  @Post('run')
  async run(@AuthUser() c: AuthClaims, @Body() body: { dryRun?: boolean }) {
    await this.admin(c)
    return this.reminders.run({ dryRun: body?.dryRun === true, trigger: 'manual' })
  }
}
