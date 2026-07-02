import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  // Trả về shape khớp mock hiện tại của frontend (collaboratorIds là mảng id)
  async findAll() {
    const tasks = await this.prisma.task.findMany({
      where: { archived: false },
      include: {
        collaborators: { select: { userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return tasks.map(({ collaborators, ...task }) => ({
      ...task,
      collaboratorIds: collaborators.map((c) => c.userId),
    }))
  }
}
