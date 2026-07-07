import { Injectable, UnauthorizedException } from '@nestjs/common'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { loadAzureAdConfig, type AzureAdConfig } from './entra.config'
import type { SessionUser } from './session.service'

/**
 * Luồng OAuth2 Authorization Code (confidential client) — bản Node tương đương
 * AzureADProvider của NextAuth mà app văn bản/phê duyệt dùng.
 */
@Injectable()
export class AuthService {
  readonly cfg: AzureAdConfig = loadAzureAdConfig()
  private readonly jwks = this.cfg.tenantId
    ? createRemoteJWKSet(new URL(this.cfg.jwksUri))
    : null

  buildAuthorizeUrl(state: string): string {
    const p = new URLSearchParams({
      client_id: this.cfg.clientId,
      response_type: 'code',
      redirect_uri: this.cfg.redirectUri,
      response_mode: 'query',
      scope: this.cfg.scopes,
      state,
    })
    return `${this.cfg.authorizeUrl}?${p.toString()}`
  }

  /** Đổi authorization code lấy token, verify id_token, trả danh tính. */
  async exchangeCode(code: string): Promise<SessionUser> {
    const body = new URLSearchParams({
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.cfg.redirectUri,
      scope: this.cfg.scopes,
    })
    const res = await fetch(this.cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const json = await res.json()
    if (!res.ok) {
      throw new UnauthorizedException(
        `Đổi code thất bại: ${json.error_description || json.error || res.status}`,
      )
    }
    const claims = await this.verifyIdToken(json.id_token as string)
    const email = (
      (claims.preferred_username as string) ||
      (claims.email as string) ||
      (claims.upn as string) ||
      ''
    ).toLowerCase()
    if (!email) throw new UnauthorizedException('Token không chứa email/UPN')
    return {
      oid: (claims.oid as string) || (claims.sub as string) || null,
      email,
      name: (claims.name as string) || null,
    }
  }

  private async verifyIdToken(idToken: string) {
    if (!this.jwks) throw new UnauthorizedException('Chưa cấu hình tenant Azure AD')
    const { payload } = await jwtVerify(idToken, this.jwks, {
      issuer: this.cfg.issuer,
      audience: this.cfg.clientId,
    })
    return payload
  }

  /** Chỉ tài khoản công ty (@biahalong.com) — giống domain restriction app kia. */
  isAllowedDomain(email: string): boolean {
    return email.toLowerCase().trim().endsWith(this.cfg.allowedDomain)
  }
}
