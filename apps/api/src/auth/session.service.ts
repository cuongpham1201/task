import { Injectable } from '@nestjs/common'
import { SignJWT, jwtVerify } from 'jose'
import { loadAzureAdConfig } from './entra.config'

export interface SessionUser {
  oid: string | null
  email: string
  name: string | null
}

/** Ký/kiểm session JWT lưu trong cookie httpOnly (giống session cookie của NextAuth). */
@Injectable()
export class SessionService {
  static readonly COOKIE = 'giaoviec_session'
  private readonly key = new TextEncoder().encode(loadAzureAdConfig().sessionSecret)

  async sign(user: SessionUser): Promise<string> {
    return new SignJWT({ email: user.email, name: user.name, oid: user.oid })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.oid || user.email)
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(this.key)
  }

  async verify(token: string): Promise<SessionUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.key)
      return {
        oid: (payload.oid as string) ?? null,
        email: payload.email as string,
        name: (payload.name as string) ?? null,
      }
    } catch {
      return null
    }
  }
}
