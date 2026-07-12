import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { UsersService } from '../users/users.service'
import { ReportsService } from './reports.service'

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly users: UsersService,
  ) {}

  // Scope tự theo vai trò (TGĐ toàn cty / GĐ khối / TP phòng) qua actionWhere.
  // orgUnitId để drill 1 phòng/khối; period lọc theo tháng 'YYYY-MM'.
  // P1-1: báo cáo tổng hợp BLĐ — aggregate server-side, scope theo vai trò tổ chức
  @Get('overview')
  async overview(@AuthUser() c: AuthClaims, @Query() q: any) {
    const me = await this.users.resolveFromClaims(c)
    return this.reports.overview(me, q)
  }

  // Drill-down danh sách task nguồn (paginate) — cùng filter/bucket với overview
  @Get('tasks')
  async tasks(@AuthUser() c: AuthClaims, @Query() q: any) {
    const me = await this.users.resolveFromClaims(c)
    return this.reports.drillTasks(me, q)
  }

  @Get('action-log')
  async actionLog(@AuthUser() c: AuthClaims, @Query('period') period?: string, @Query('orgUnitId') orgUnitId?: string) {
    const me = await this.users.resolveFromClaims(c)
    return this.reports.actionLog(me, { period, orgUnitId })
  }
}
