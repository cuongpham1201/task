import { Global, Module } from '@nestjs/common'
import { GraphAppTokenService } from './graph-app-token.service'
import { TeamsActivityService } from './teams-activity.service'

@Global()
@Module({
  providers: [GraphAppTokenService, TeamsActivityService],
  exports: [TeamsActivityService],
})
export class TeamsModule {}
