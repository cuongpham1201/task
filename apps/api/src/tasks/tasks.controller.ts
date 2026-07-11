import {
  Body, Controller, Delete, Get, Param, Patch, Post, UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { UsersService } from '../users/users.service'
import { TasksService } from './tasks.service'
import {
  AssigneeDto, CollaboratorsDto, CreateTaskDto, DueDateDto, PriorityDto, ProgressDto, ReviewDto,
  StatusDto, TaskOrgUnitDto, UpdateTaskDto, WorkLogDto,
} from './task.dto'

@Controller('tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly users: UsersService,
  ) {}

  private me(claims: AuthClaims) {
    return this.users.resolveFromClaims(claims)
  }

  @Get()
  async findAll(@AuthUser() c: AuthClaims) {
    return this.tasks.findAll(await this.me(c))
  }

  @Post()
  async create(@AuthUser() c: AuthClaims, @Body() dto: CreateTaskDto) {
    return this.tasks.create(await this.me(c), dto)
  }

  @Patch(':id/status')
  async status(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.tasks.setStatus(await this.me(c), id, dto.status)
  }

  @Post(':id/submit')
  async submit(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    return this.tasks.submit(await this.me(c), id)
  }

  @Get(':id/worklogs')
  async listWorkLogs(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    return this.tasks.listWorkLogs(await this.me(c), id)
  }

  @Post(':id/worklogs')
  async addWorkLog(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: WorkLogDto) {
    return this.tasks.addWorkLog(await this.me(c), id, dto)
  }

  @Post(':id/watch')
  async watch(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    return this.tasks.watch(await this.me(c), id)
  }

  @Delete(':id/watch')
  async unwatch(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    return this.tasks.unwatch(await this.me(c), id)
  }

  @Post(':id/review')
  async review(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.tasks.review(await this.me(c), id, dto)
  }

  @Patch(':id/assignee')
  async assignee(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: AssigneeDto) {
    return this.tasks.setAssignee(await this.me(c), id, dto)
  }

  // FEATURE-004: sửa người phối hợp sau khi tạo
  @Patch(':id/collaborators')
  async setCollaborators(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: CollaboratorsDto) {
    return this.tasks.setCollaborators(await this.me(c), id, dto)
  }

  // FEATURE-004: chuyển đơn vị yêu cầu của task
  @Patch(':id/org-unit')
  async setOrgUnit(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: TaskOrgUnitDto) {
    return this.tasks.setOrgUnit(await this.me(c), id, dto)
  }

  @Patch(':id/due-date')
  async dueDate(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: DueDateDto) {
    return this.tasks.setDueDate(await this.me(c), id, dto)
  }

  @Patch(':id/priority')
  async priority(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: PriorityDto) {
    return this.tasks.setPriority(await this.me(c), id, dto)
  }

  @Patch(':id/progress')
  async progress(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: ProgressDto) {
    return this.tasks.setProgress(await this.me(c), id, dto)
  }

  @Patch(':id')
  async update(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.updateFields(await this.me(c), id, dto)
  }

  @Delete(':id')
  async remove(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    return this.tasks.archive(await this.me(c), id)
  }
}
