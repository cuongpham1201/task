import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { AuthClaims } from './auth.types'

/** Lấy danh tính đã được AuthGuard gắn vào request. */
export const AuthUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthClaims => {
    return ctx.switchToHttp().getRequest().authClaims
  },
)
