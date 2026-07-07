import { Controller, Get } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Controller('projects')
export class ProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  // Shape khớp mock frontend: members là mảng userId
  @Get()
  async findAll() {
    const projects = await this.prisma.project.findMany({
      where: { archived: false },
      include: { members: { select: { userId: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return projects.map(({ members, ...p }) => ({
      ...p,
      members: members.map((m) => m.userId),
    }))
  }
}
