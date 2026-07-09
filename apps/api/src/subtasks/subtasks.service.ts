import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PolicyService } from '../common/policy.service'
import { NotificationsService } from '../notifications/notifications.service'

type Me = { id: string; role: string; orgUnitId: string | null }

@Injectable()
export class SubtasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly notifications: NotificationsService,
  ) {}

  private async task(taskId: string) {
    const t = await this.prisma.task.findUnique({ where: { id: taskId }, include: { workspace: true } })
    if (!t || t.archived) throw new NotFoundException('Không tìm thấy công việc')
    return t
  }

  async create(me: Me, taskId: string, title: string, assigneeId?: string) {
    const task = await this.task(taskId)
    this.policy.assert(await this.policy.canUpdateStatus(me, task), 'Không có quyền thêm việc con')
    const count = await this.prisma.subtask.count({ where: { taskId } })
    const sub = await this.prisma.$transaction(async (tx) => {
      const s = await tx.subtask.create({
        data: { taskId, title, assigneeId: assigneeId ?? null, sortOrder: count },
      })
      await this.notifications.emit(tx, { task, actorId: me.id, action: 'subtask', notifyType: null })
      return s
    })
    return sub
  }

  async update(me: Me, id: string, data: { done?: boolean; title?: string }) {
    const sub = await this.prisma.subtask.findUnique({ where: { id } })
    if (!sub) throw new NotFoundException('Không tìm thấy việc con')
    const task = await this.task(sub.taskId)
    this.policy.assert(await this.policy.canUpdateStatus(me, task), 'Không có quyền cập nhật việc con')
    return this.prisma.subtask.update({
      where: { id },
      data: {
        ...(data.done !== undefined ? { done: data.done } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
      },
    })
  }

  async remove(me: Me, id: string) {
    const sub = await this.prisma.subtask.findUnique({ where: { id } })
    if (!sub) throw new NotFoundException('Không tìm thấy việc con')
    const task = await this.task(sub.taskId)
    this.policy.assert(await this.policy.canManage(me, task), 'Không có quyền xóa việc con')
    await this.prisma.subtask.delete({ where: { id } })
    return { deleted: true }
  }
}
