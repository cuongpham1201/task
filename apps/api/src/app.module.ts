import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { HealthController } from './health/health.controller'
import { TasksModule } from './tasks/tasks.module'
import { DepartmentsModule } from './departments/departments.module'
import { ChannelsModule } from './channels/channels.module'

@Module({
  imports: [PrismaModule, TasksModule, DepartmentsModule, ChannelsModule],
  controllers: [HealthController],
})
export class AppModule {}
