import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { createWriteStream, mkdirSync, existsSync, unlink } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { PolicyService } from '../common/policy.service'
import type { Me } from '../common/visibility.service'

const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'))
const MAX_BYTES = 25 * 1024 * 1024

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
  ) {}

  private serialize(a: any) {
    const mt = a.mimeType || ''
    return {
      id: a.id, taskId: a.taskId, fileName: a.fileName, mimeType: mt,
      sizeBytes: Number(a.sizeBytes), uploadedById: a.uploadedById, createdAt: a.createdAt,
      isImage: mt.startsWith('image/'), isPdf: mt === 'application/pdf',
    }
  }

  private async loadTask(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } })
    if (!task || task.archived) throw new NotFoundException('Không tìm thấy công việc')
    return task
  }

  async list(me: Me, taskId: string) {
    const task = await this.loadTask(taskId)
    this.policy.assert(await this.policy.canView(me, task), 'Không có quyền xem đính kèm')
    const rows = await this.prisma.attachment.findMany({
      where: { taskId, deletedAt: null }, orderBy: { createdAt: 'desc' },
    })
    return rows.map((r) => this.serialize(r))
  }

  async upload(me: Me, taskId: string, file: any) {
    if (!file) throw new BadRequestException('Không có tệp')
    if (file.size > MAX_BYTES) throw new BadRequestException('Tệp vượt quá 25MB')
    const task = await this.loadTask(taskId)
    this.policy.assert(await this.policy.canView(me, task), 'Không có quyền đính kèm')
    const safe = (file.originalname || 'file').replace(/[^\w.\-]+/g, '_').slice(-120)
    const key = `${taskId}/${randomUUID()}-${safe}`
    const abs = join(UPLOAD_DIR, key)
    mkdirSync(join(UPLOAD_DIR, taskId), { recursive: true })
    await new Promise<void>((res, rej) => {
      const ws = createWriteStream(abs)
      ws.on('error', rej); ws.on('finish', () => res())
      ws.end(file.buffer)
    })
    const row = await this.prisma.attachment.create({
      data: {
        taskId, uploadedById: me.id, fileName: file.originalname || safe,
        mimeType: file.mimetype || 'application/octet-stream', sizeBytes: BigInt(file.size),
        storageKey: key,
      },
    })
    return this.serialize(row)
  }

  // Trả path tuyệt đối sau khi kiểm quyền xem task (dùng để stream).
  async resolveForRead(me: Me, id: string) {
    const a = await this.prisma.attachment.findUnique({ where: { id } })
    if (!a || a.deletedAt || !a.storageKey) throw new NotFoundException('Không tìm thấy tệp')
    const task = await this.loadTask(a.taskId)
    this.policy.assert(await this.policy.canView(me, task), 'Không có quyền tải tệp')
    const abs = join(UPLOAD_DIR, a.storageKey)
    if (!existsSync(abs)) throw new NotFoundException('Tệp không tồn tại trên hệ thống')
    return { attachment: this.serialize(a), abs }
  }

  async remove(me: Me, id: string) {
    const a = await this.prisma.attachment.findUnique({ where: { id } })
    if (!a || a.deletedAt) throw new NotFoundException('Không tìm thấy tệp')
    const task = await this.loadTask(a.taskId)
    const allowed = a.uploadedById === me.id || me.role === 'admin' || (await this.policy.canManage(me, task))
    if (!allowed) throw new ForbiddenException('Chỉ người tải lên hoặc quản lý mới xóa được')
    await this.prisma.attachment.update({ where: { id }, data: { deletedAt: new Date() } })
    if (a.storageKey) unlink(join(UPLOAD_DIR, a.storageKey), () => {})
    return { deleted: true }
  }
}
