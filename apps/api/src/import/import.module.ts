import { Module } from '@nestjs/common'
import { ImportController } from './import.controller'
import { ImportService } from './import.service'

// PrismaModule + UsersModule là @Global → không cần import lại.
@Module({
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
