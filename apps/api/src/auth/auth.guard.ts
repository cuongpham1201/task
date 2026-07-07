import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { loadAzureAdConfig } from './entra.config'
import { SessionService } from './session.service'
import type { AuthClaims } from './auth.types'

type AuthedRequest = Request & { authClaims?: AuthClaims; cookies?: Record<string, string> }

/**
 * Guard xác thực bằng cookie session (do luồng OAuth ở AuthController tạo).
 *  - SSO bật: bắt buộc cookie session hợp lệ.
 *  - SSO tắt (dev): nhận danh tính qua header x-dev-user-email (fallback DEV_USER_EMAIL).
 *    Bị CHẶN ở production để tránh lỗ hổng.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly cfg = loadAzureAdConfig()

  constructor(private readonly session: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>()

    if (this.cfg.enabled) {
      const token = req.cookies?.[SessionService.COOKIE]
      if (!token) throw new UnauthorizedException('Chưa đăng nhập')
      const user = await this.session.verify(token)
      if (!user) throw new UnauthorizedException('Phiên đăng nhập hết hạn')
      req.authClaims = { oid: user.oid, email: user.email, name: user.name, raw: {} }
      return true
    }

    // ── Chế độ DEV ──
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('SSO chưa cấu hình mà đang chạy production — từ chối')
    }
    const devEmail =
      (req.headers['x-dev-user-email'] as string) || process.env.DEV_USER_EMAIL || null
    req.authClaims = { oid: null, email: devEmail, name: null, raw: { dev: true } }
    return true
  }
}
