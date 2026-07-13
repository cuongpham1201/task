import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PolicyService } from '../common/policy.service'
import { NotificationsService } from '../notifications/notifications.service'
import { TeamsActivityService } from '../teams/teams-activity.service'

type Me = { id: string; role: string; orgUnitId: string | null }

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly notifications: NotificationsService,
    private readonly teams: TeamsActivityService,
  ) {}

  async create(me: Me, taskId: string, content: string, mentionIds: string[] = []) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, include: { workspace: true } })
    if (!task || task.archived) throw new NotFoundException('Không tìm thấy công việc')
    this.policy.assert(await this.policy.canComment(me, task), 'Không có quyền bình luận')

    // Hướng 3: CHẶN @mention người ngoài phạm vi xem task — chống rò rỉ nội dung/ping mồ côi.
    let ids = [...new Set((mentionIds || []).filter((id) => id && id !== me.id))]
    if (ids.length) {
      const viewable = await this.policy.filterCanView(task, ids)
      const blocked = ids.filter((id) => !viewable.has(id))
      if (blocked.length) {
        const names = await this.prisma.user.findMany({ where: { id: { in: blocked } }, select: { displayName: true } })
        throw new BadRequestException(
          `Không thể nhắc ${names.map((n) => n.displayName).join(', ')} — họ không có quyền xem công việc này`,
        )
      }
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const c = await tx.comment.create({ data: { taskId, userId: me.id, content } })
      const activity = await this.notifications.emit(tx, {
        task, actorId: me.id, action: 'comment', notifyType: 'comment_added',
      })
      // @Mention: người nhắc đã được xác thực quyền xem ở trên
      if (ids.length) {
        await tx.notification.createMany({
          data: ids.map((userId) => ({ userId, type: 'mentioned' as any, activityId: activity.id, taskId })),
        })
      }
      return c
    })
    // Teams Activity (SAU commit): comment cho stakeholders; mention riêng cho người được nhắc.
    // eventSuffix = comment.id (bền) → cùng comment không bao giờ gửi trùng.
    const [collaborators, watchers] = await Promise.all([
      this.prisma.taskCollaborator.findMany({ where: { taskId }, select: { userId: true } }),
      this.prisma.taskWatcher.findMany({ where: { taskId }, select: { userId: true } }),
    ])
    const mentionSet = new Set((mentionIds || []).filter(Boolean))
    const commentRecipients = new Set<string>([
      task.assigneeId, task.creatorId,
      ...collaborators.map((c) => c.userId), ...watchers.map((w) => w.userId),
    ])
    const preview = content.length > 120 ? content.slice(0, 117) + '…' : content
    // Hướng 1: chỉ gửi Teams cho người CÒN QUYỀN XEM task (đồng bộ với lọc in-app)
    const allTargets = [...new Set([...mentionSet, ...commentRecipients])]
    const canSee = await this.policy.filterCanView(task, allTargets)
    const events = []
    for (const uid of mentionSet) {
      if (!canSee.has(uid)) continue
      events.push({
        type: 'taskMentioned' as const, recipientUserId: uid, actorUserId: me.id,
        targetType: 'task' as const, targetId: taskId, taskInfo: task.title,
        previewText: preview, path: `/my-tasks?task=${taskId}`, eventSuffix: comment.id,
      })
    }
    for (const uid of commentRecipients) {
      if (mentionSet.has(uid)) continue // đã nhận mention — không gửi kép
      if (!canSee.has(uid)) continue // hướng 1: không gửi Teams cho người không xem được task
      events.push({
        type: 'taskCommented' as const, recipientUserId: uid, actorUserId: me.id,
        targetType: 'task' as const, targetId: taskId, taskInfo: task.title,
        previewText: preview, path: `/my-tasks?task=${taskId}`, eventSuffix: comment.id,
      })
    }
    this.teams.sendMany(events)
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
