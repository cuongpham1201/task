import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { NotificationsService } from '../notifications/notifications.service'

// Trả toàn bộ dữ liệu khởi tạo cho frontend (1 round-trip), thay mock.
// Tạm map Project → "channel" shape để khớp UI hiện tại (FE chưa đổi thuật ngữ).
@Controller('bootstrap')
@UseGuards(AuthGuard)
export class BootstrapController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  async get(@AuthUser() claims: AuthClaims) {
    const me = await this.users.resolveFromClaims(claims)
    const [users, departments, projects, tasks, subtasks, comments, activities] =
      await Promise.all([
        this.prisma.user.findMany({
          where: { active: true },
          select: {
            id: true, email: true, displayName: true,
            departmentId: true, role: true, jobTitle: true, avatarUrl: true,
          },
          orderBy: { displayName: 'asc' },
        }),
        this.prisma.department.findMany({ orderBy: { code: 'asc' } }),
        this.prisma.project.findMany({
          where: { archived: false },
          include: { members: { select: { userId: true } } },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.task.findMany({
          where: { archived: false },
          include: { collaborators: { select: { userId: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.subtask.findMany({ orderBy: { sortOrder: 'asc' } }),
        this.prisma.comment.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.activity.findMany({ orderBy: { createdAt: 'asc' } }),
      ])

    const channels = projects.map(({ members, ...p }) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      members: members.map((m) => m.userId),
    }))

    const tasksOut = tasks.map(({ collaborators, projectId, scope, ...t }) => ({
      ...t,
      scope: scope === 'project' ? 'channel' : scope,
      channelId: projectId,
      collaboratorIds: collaborators.map((c) => c.userId),
    }))

    return {
      users,
      departments,
      channels,
      tasks: tasksOut,
      subtasks,
      comments,
      // Activity.id là BigInt → chuyển string để JSON hóa được
      activities: activities.map((a) => ({
        id: String(a.id),
        taskId: a.taskId,
        userId: a.userId,
        action: a.action,
        metadata: a.metadata,
        createdAt: a.createdAt,
      })),
      // Thông báo thật của người đăng nhập (fan-out từ server)
      notifications: await this.notificationsService.listForUser(me.id),
    }
  }
}
