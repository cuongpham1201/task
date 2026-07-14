import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { UsersService } from '../users/users.service'
import { ImportService } from './import.service'
import { ExecuteAsanaDto, ParseAsanaDto, PreviewAsanaDto } from './import.dto'

/**
 * P1-6 — Import Asana JSON. CHỈ Admin (kiểm server-side như RemindersController).
 * parse → preview(dry-run) → execute. batches/:id = lịch sử + kết quả.
 * Body limit riêng cho path này được nới ở main.ts (JSON Asana lớn).
 */
@Controller('admin/import/asana')
@UseGuards(AuthGuard)
export class ImportController {
  constructor(
    private readonly imports: ImportService,
    private readonly users: UsersService,
  ) {}

  private async admin(c: AuthClaims) {
    const me = await this.users.resolveFromClaims(c)
    if (me.role !== 'admin') throw new ForbiddenException('Chỉ quản trị viên')
    return me
  }

  @Post('parse')
  async parse(@AuthUser() c: AuthClaims, @Body() dto: ParseAsanaDto) {
    const me = await this.admin(c)
    return this.imports.parse(me.id, dto.rawJson)
  }

  @Post('preview')
  async preview(@AuthUser() c: AuthClaims, @Body() dto: PreviewAsanaDto) {
    const me = await this.admin(c)
    return this.imports.preview(me.id, true, dto.batchId, dto.config, dto.defaultOrgUnitId || null, dto.targetProjectId || null)
  }

  @Post('execute')
  async execute(@AuthUser() c: AuthClaims, @Body() dto: ExecuteAsanaDto) {
    const me = await this.admin(c)
    return this.imports.execute(me.id, true, dto.batchId, dto.config, dto.defaultOrgUnitId || null, dto.targetProjectId || null, {
      createProject: dto.createProject || null,
    })
  }

  @Get('batches')
  async batches(@AuthUser() c: AuthClaims) {
    await this.admin(c)
    return this.imports.listBatches()
  }

  @Post('batches/:id/rollback')
  async rollback(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    const me = await this.admin(c)
    return this.imports.rollback(me.id, true, id)
  }

  @Get('batches/:id')
  async batch(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    await this.admin(c)
    return this.imports.getBatch(id)
  }
}
