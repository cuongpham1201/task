import { Global, Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { SessionService } from './session.service'
import { AuthGuard } from './auth.guard'
import { LocalAuthService } from './local-auth.service'

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, AuthGuard, LocalAuthService],
  exports: [AuthService, SessionService, AuthGuard, LocalAuthService],
})
export class AuthModule {}
