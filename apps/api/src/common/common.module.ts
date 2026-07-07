import { Global, Module } from '@nestjs/common'
import { PolicyService } from './policy.service'
import { VisibilityService } from './visibility.service'

@Global()
@Module({
  providers: [PolicyService, VisibilityService],
  exports: [PolicyService, VisibilityService],
})
export class CommonModule {}
