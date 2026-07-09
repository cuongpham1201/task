import {
  Controller, Delete, Get, Param, Post, Query, Res, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { createReadStream } from 'node:fs'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { UsersService } from '../users/users.service'
import { AttachmentsService } from './attachments.service'

@Controller()
@UseGuards(AuthGuard)
export class AttachmentsController {
  constructor(
    private readonly attachments: AttachmentsService,
    private readonly users: UsersService,
  ) {}

  private me(c: AuthClaims) { return this.users.resolveFromClaims(c) }

  @Get('tasks/:id/attachments')
  async list(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    return this.attachments.list(await this.me(c), id)
  }

  @Post('tasks/:id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async upload(@AuthUser() c: AuthClaims, @Param('id') id: string, @UploadedFile() file: any) {
    return this.attachments.upload(await this.me(c), id, file)
  }

  @Get('attachments/:id/file')
  async file(@AuthUser() c: AuthClaims, @Param('id') id: string, @Query('dl') dl: string, @Res() res: Response) {
    const { attachment, abs } = await this.attachments.resolveForRead(await this.me(c), id)
    res.setHeader('Content-Type', attachment.mimeType)
    // preview (inline) cho ảnh/pdf; tải xuống khi ?dl=1
    const disp = dl === '1' ? 'attachment' : (attachment.isImage || attachment.isPdf ? 'inline' : 'attachment')
    res.setHeader('Content-Disposition', `${disp}; filename="${encodeURIComponent(attachment.fileName)}"`)
    createReadStream(abs).pipe(res)
  }

  @Delete('attachments/:id')
  async remove(@AuthUser() c: AuthClaims, @Param('id') id: string) {
    return this.attachments.remove(await this.me(c), id)
  }
}
