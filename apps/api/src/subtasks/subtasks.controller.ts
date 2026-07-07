import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { UsersService } from '../users/users.service'
import { SubtasksService } from './subtasks.service'
import { CreateSubtaskDto, UpdateSubtaskDto } from '../tasks/task.dto'

@Controller()
@UseGuards(AuthGuard)
export class SubtasksController {
  constructor(
    private readonly subtasks: SubtasksService,
    private readonly users: UsersService,
  ) {}

  private me(c: AuthClaims) {
    return this.users.resolveFromClaims(c)
  }

  @Post('tasks/:taskId/subtasks')
  async create(@AuthUser() c: AuthClaims, @Param('taskId') taskId: string, @Body() dto: CreateSubtaskDto) {
    return this.subtasks.create(await this.me(c), taskId, dto.title, dto.assigneeId)
  }

  @Patch('subtasks/:id')
  async update(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: UpdateSubtaskDto) {
    return this.subtasks.update(await this.me(c), id, dto)
  }

  @Delete('subtasks/:id')
  async remove(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    return this.subtasks.remove(await this.me(c), id)
  }
}
