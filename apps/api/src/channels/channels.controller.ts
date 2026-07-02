import { Controller, Get } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Controller('channels')
export class ChannelsController {
  constructor(private readonly prisma: PrismaService) {}

  // Shape khớp mock frontend: members là mảng userId
  @Get()
  async findAll() {
    const channels = await this.prisma.channel.findMany({
      where: { archived: false },
      include: { members: { select: { userId: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return channels.map(({ members, ...c }) => ({
      ...c,
      members: members.map((m) => m.userId),
    }))
  }
}
