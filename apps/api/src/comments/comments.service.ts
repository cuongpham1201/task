import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PolicyService } from '../common/policy.service'
import { NotificationsService } from '../notifications/notifications.service'

type Me = { id: string; role: string; orgUnitId: string | null }

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(me: Me, taskId: string, content: string, mentionIds: string[] = []) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, include: { workspace: true } })
    if (!task || task.archived) throw new NotFoundException('Không tìm thấy công việc')
    this.policy.assert(await this.policy.canComment(me, task), 'Không có quyền bình luận')
    const comment = await this.prisma.$transaction(async (tx) => {
      const c = await tx.comment.create({ data: { taskId, userId: me.id, content } })
      const activity = await this.notifications.emit(tx, {
        task, actorId: me.id, action: 'comment', notifyType: 'comment_added',
      })
      // @Mention: thông báo riêng cho người được nhắc (listForUser vẫn lọc theo quyền xem task)
      const ids = [...new Set((mentionIds || []).filter((id) => id && id !== me.id))]
      if (ids.length) {
        await tx.notification.createMany({
          data: ids.map((userId) => ({ userId, type: 'mentioned' as any, activityId: activity.id, taskId })),
        })
      }
      return c
    })
    return comment
  }

  async update(me: Me, id: string, content: string) {
    const c = await this.prisma.comment.findUnique({ where: { id } })
    if (!c || c.deletedAt) throw new NotFoundException('Không tìm thấy bình luận')
    if (c.userId !== me.id && me.role !== 'admin') throw new ForbiddenException('Chỉ sửa bình luận của mình')
    return this.prisma.comment.update({ where: { id }, data: { content, updatedAt: new Date() } })
  }

  async remove(me: Me, id: string) {
    const c = await this.prisma.comment.findUnique({ where: { id } })
    if (!c || c.deletedAt) throw new NotFoundException('Không tìm thấy bình luận')
    if (c.userId !== me.id && me.role !== 'admin') throw new ForbiddenException('Chỉ xóa bình luận của mình')
    await this.prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }
}
