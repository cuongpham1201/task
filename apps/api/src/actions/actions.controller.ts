import {
  Body, Controller, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { UsersService } from '../users/users.service'
import { ActionsService } from './actions.service'
import { CreateActionDto, CreateActionUpdateDto, UpdateActionDto } from './action.dto'

@Controller('actions')
@UseGuards(AuthGuard)
export class ActionsController {
  constructor(
    private readonly actions: ActionsService,
    private readonly users: UsersService,
  ) {}

  private me(c: AuthClaims) {
    return this.users.resolveFromClaims(c)
  }

  @Get()
  async list(@AuthUser() c: AuthClaims, @Query('period') period?: string, @Query('orgUnitId') orgUnitId?: string) {
    return this.actions.list(await this.me(c), { period, orgUnitId })
  }

  @Post()
  async create(@AuthUser() c: AuthClaims, @Body() dto: CreateActionDto) {
    return this.actions.create(await this.me(c), dto)
  }

  @Get(':id')
  async detail(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    return this.actions.detail(await this.me(c), id)
  }

  @Patch(':id')
  async update(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: UpdateActionDto) {
    return this.actions.update(await this.me(c), id, dto)
  }

  @Post(':id/archive')
  async archive(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    return this.actions.archive(await this.me(c), id)
  }

  @Get(':id/tasks')
  async tasks(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    return this.actions.tasksOf(await this.me(c), id)
  }

  @Get(':id/updates')
  async updates(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    return this.actions.listUpdates(await this.me(c), id)
  }

  @Post(':id/updates')
  async addUpdate(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: CreateActionUpdateDto) {
    return this.actions.addUpdate(await this.me(c), id, dto)
  }
}
