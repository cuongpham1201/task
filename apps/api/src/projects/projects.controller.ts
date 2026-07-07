import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'

// Dự án = PROJECT workspace user là member (shape "channel" khớp FE).
@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  @Get()
  async findAll(@AuthUser() claims: AuthClaims) {
    const me = await this.users.resolveFromClaims(claims)
    const myIds = (await this.prisma.workspaceMember.findMany({ where: { userId: me.id }, select: { workspaceId: true } })).map((m) => m.workspaceId)
    const projects = await this.prisma.workspace.findMany({
      where: { type: 'project', archived: false, ...(me.role === 'admin' ? {} : { id: { in: myIds } }) },
      include: { members: { select: { userId: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return projects.map((w) => ({ id: w.id, name: w.name, description: w.description, members: w.members.map((m) => m.userId) }))
  }
}
