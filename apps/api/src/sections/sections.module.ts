import { Module } from '@nestjs/common'
import { SectionsController } from './sections.controller'

// PrismaModule + UsersModule là @Global → không cần import lại.
@Module({
  controllers: [SectionsController],
})
export class SectionsModule {}
