import { Global, Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { AvatarService } from './avatar.service'

@Global()
@Module({
  controllers: [UsersController],
  providers: [UsersService, AvatarService],
  exports: [UsersService, AvatarService],
})
export class UsersModule {}
