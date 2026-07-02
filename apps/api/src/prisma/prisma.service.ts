import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // Không chặn API khởi động khi DB chưa sẵn sàng — /health sẽ báo trạng thái DB
    try {
      await this.$connect()
    } catch (err) {
      console.warn('[Prisma] Chưa kết nối được PostgreSQL:', (err as Error).message)
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
