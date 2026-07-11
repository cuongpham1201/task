import { Controller, Get, Query, Req, Res } from '@nestjs/common'
import { randomUUID } from 'crypto'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { SessionService } from './session.service'
import { UsersService } from '../users/users.service'
import { AvatarService } from '../users/avatar.service'

const STATE_COOKIE = 'giaoviec_oauth_state'
// Đánh dấu login khởi phát từ Teams popup (giá trị boolean nội bộ — không chứa URL).
const TEAMS_FLOW_COOKIE = 'giaoviec_oauth_teams'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionService,
    private readonly users: UsersService,
    private readonly avatars: AvatarService,
  ) {}

  private secure() {
    return this.auth.cfg.redirectUri.startsWith('https')
  }

  /**
   * SameSite cho cookie: Teams tab = iframe của teams.microsoft.com → mọi request
   * từ app là CROSS-SITE so với top-level → cookie Lax KHÔNG được gửi → /me 401
   * vĩnh viễn (login loop). Fix giống Phê duyệt (src/lib/auth.ts) & Văn bản
   * (lib/auth/options.ts #31K): HTTPS dùng 'none' + Secure (hợp lệ cả browser
   * first-party lẫn iframe); dev HTTP giữ 'lax' (none đòi hỏi Secure).
   */
  private sameSite(): 'none' | 'lax' {
    return this.secure() ? 'none' : 'lax'
  }

  /** Bắt đầu đăng nhập: chuyển hướng tới trang đăng nhập Microsoft.
   *  ?teams=1 = khởi phát từ Teams popup → callback sẽ về /auth/teams-complete. */
  @Get('login')
  login(@Res() res: Response, @Query('teams') teams?: string) {
    const cfg = this.auth.cfg
    if (!cfg.enabled) return res.redirect(cfg.webOrigin) // dev: không cần đăng nhập
    const state = randomUUID()
    const cookieOpts = {
      httpOnly: true,
      sameSite: this.sameSite(),
      secure: this.secure(),
      maxAge: 10 * 60 * 1000,
      path: '/',
    } as const
    res.cookie(STATE_COOKIE, state, cookieOpts)
    if (teams === '1') res.cookie(TEAMS_FLOW_COOKIE, '1', cookieOpts)
    return res.redirect(this.auth.buildAuthorizeUrl(state))
  }

  /** Microsoft gọi lại kèm code: đổi token, chặn domain, set cookie session. */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const cfg = this.auth.cfg
    const saved = (req as any).cookies?.[STATE_COOKIE]
    res.clearCookie(STATE_COOKIE, { path: '/' })
    if (!code || !state || state !== saved) {
      return res.redirect(`${cfg.webOrigin}/?auth_error=state`)
    }
    try {
      const user = await this.auth.exchangeCode(code)
      if (!this.auth.isAllowedDomain(user.email)) {
        return res.redirect(`${cfg.webOrigin}/?auth_error=domain`)
      }
      const token = await this.session.sign(user)
      // BUG3: lấy ảnh Graph (delegated User.Read) — fire-and-forget, không chặn login
      this.users
        .resolveFromClaims({ oid: user.oid, email: user.email, name: user.name, raw: {} })
        .then((u) => this.avatars.fetchAndCache(u.id, user.accessToken))
        .catch(() => {})
      res.cookie(SessionService.COOKIE, token, {
        httpOnly: true,
        sameSite: this.sameSite(),
        secure: this.secure(),
        maxAge: 8 * 60 * 60 * 1000,
        path: '/',
      })
      // Login khởi phát từ Teams (popup authenticate) → về trang notify để đóng popup.
      // Đích HARDCODE nội bộ (webOrigin + path cố định) — không nhận URL ngoài → không open redirect.
      const fromTeams = (req as any).cookies?.[TEAMS_FLOW_COOKIE] === '1'
      res.clearCookie(TEAMS_FLOW_COOKIE, { path: '/' })
      return res.redirect(fromTeams ? `${cfg.webOrigin}/auth/teams-complete` : cfg.webOrigin)
    } catch (e) {
      console.error('[auth/callback] exchange error:', (e as Error).message)
      return res.redirect(`${cfg.webOrigin}/?auth_error=exchange`)
    }
  }

  /** Đăng xuất: xóa cookie session, gọi logout của Microsoft. */
  @Get('logout')
  logout(@Res() res: Response) {
    const cfg = this.auth.cfg
    res.clearCookie(SessionService.COOKIE, { path: '/' })
    if (cfg.enabled) {
      const url =
        `${cfg.authority}/oauth2/v2.0/logout` +
        `?post_logout_redirect_uri=${encodeURIComponent(cfg.webOrigin)}`
      return res.redirect(url)
    }
    return res.redirect(cfg.webOrigin)
  }
}
