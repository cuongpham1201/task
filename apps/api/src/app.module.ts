import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { HealthController } from './health/health.controller'
import { CommonModule } from './common/common.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { NotificationsModule } from './notifications/notifications.module'
import { TasksModule } from './tasks/tasks.module'
import { CommentsModule } from './comments/comments.module'
import { SubtasksModule } from './subtasks/subtasks.module'
import { DepartmentsModule } from './departments/departments.module'
import { ProjectsModule } from './projects/projects.module'
import { BootstrapModule } from './bootstrap/bootstrap.module'

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
    TasksModule,
    CommentsModule,
    SubtasksModule,
    DepartmentsModule,
    ProjectsModule,
    BootstrapModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
