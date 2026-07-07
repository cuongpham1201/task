import { Global, Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { SessionService } from './session.service'
import { AuthGuard } from './auth.guard'

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, AuthGuard],
  exports: [AuthService, SessionService, AuthGuard],
})
export class AuthModule {}
