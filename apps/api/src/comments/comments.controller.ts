import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { UsersService } from '../users/users.service'
import { CommentsService } from './comments.service'
import { CreateCommentDto } from '../tasks/task.dto'

@Controller()
@UseGuards(AuthGuard)
export class CommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly users: UsersService,
  ) {}

  private me(c: AuthClaims) {
    return this.users.resolveFromClaims(c)
  }

  @Post('tasks/:taskId/comments')
  async create(@AuthUser() c: AuthClaims, @Param('taskId') taskId: string, @Body() dto: CreateCommentDto) {
    return this.comments.create(await this.me(c), taskId, dto.content)
  }

  @Patch('comments/:id')
  async update(@AuthUser() c: AuthClaims, @Param('id') id: string, @Body() dto: CreateCommentDto) {
    return this.comments.update(await this.me(c), id, dto.content)
  }

  @Delete('comments/:id')
  async remove(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    return this.comments.remove(await this.me(c), id)
  }
}
