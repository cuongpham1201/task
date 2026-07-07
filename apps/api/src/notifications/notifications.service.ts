import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { VisibilityService, type Me } from '../common/visibility.service'

type EmitArgs = {
  task: { id: string; assigneeId: string; creatorId: string }
  actorId: string
  action: string
  metadata?: Record<string, unknown>
  notifyType?: string | null
  extraRecipients?: string[]
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vis: VisibilityService,
  ) {}

  /**
   * Trong 1 transaction: tạo Activity + fan-out Notification cho stakeholders (trừ actor).
   * Gọi từ các service khác với `tx` là Prisma transaction client.
   */
  async emit(tx: any, args: EmitArgs) {
    const { task, actorId, action, metadata, notifyType, extraRecipients = [] } = args
    const activity = await tx.activity.create({
      data: { taskId: task.id, userId: actorId, action, metadata: metadata ?? {} },
    })
    if (notifyType) {
      const collaborators = await tx.taskCollaborator.findMany({
        where: { taskId: task.id },
        select: { userId: true },
      })
      const recipients = new Set<string>([
        task.assigneeId,
        task.creatorId,
        ...collaborators.map((c: any) => c.userId),
        ...extraRecipients,
      ])
      recipients.delete(actorId)
      if (recipients.size) {
        await tx.notification.createMany({
          data: [...recipients].map((userId) => ({
            userId,
            type: notifyType as any,
            activityId: activity.id,
            taskId: task.id,
          })),
        })
      }
    }
    return activity
  }

  // Chỉ trả thông báo mà user CÒN quyền xem task (defense-in-depth privacy).
  async listForUser(me: Me) {
    const rows = await this.prisma.notification.findMany({
      where: { userId: me.id },
      include: { activity: { select: { action: true, metadata: true, userId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const taskIds = [...new Set(rows.map((r) => r.taskId).filter(Boolean) as string[])]
    let visible = new Set<string>()
    if (taskIds.length && me.role !== 'admin') {
      const vis = await this.vis.taskWhere(me)
      const rowsVis = await this.prisma.task.findMany({
        where: { AND: [{ id: { in: taskIds } }, vis] },
        select: { id: true },
      })
      visible = new Set(rowsVis.map((t) => t.id))
    } else if (me.role === 'admin') {
      visible = new Set(taskIds)
    }
    return rows
      .filter((n) => !n.taskId || visible.has(n.taskId))
      .map((n) => ({
      id: String(n.id),
      type: n.type,
      taskId: n.taskId,
      readAt: n.readAt,
      createdAt: n.createdAt,
      actorId: n.activity?.userId ?? null,
      action: n.activity?.action ?? null,
      metadata: n.activity?.metadata ?? {},
    }))
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } })
  }

  async markRead(userId: string, ids?: string[]) {
    const where: any = { userId, readAt: null }
    if (ids && ids.length) where.id = { in: ids.map((i) => BigInt(i)) }
    const res = await this.prisma.notification.updateMany({
      where,
      data: { readAt: new Date() },
    })
    return { updated: res.count }
  }
}
