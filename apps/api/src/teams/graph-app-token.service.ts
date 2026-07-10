import { Injectable } from '@nestjs/common'

/**
 * Graph client-credentials token (app-only) — pattern approval-bhl/src/lib/graph.ts.
 * Cần Application permission `TeamsActivity.Send` + admin consent (xem guide).
 * Tái sử dụng AZURE_AD_* env sẵn có của app (không nhân đôi biến).
 */
const TOKEN_TIMEOUT_MS = 10_000

@Injectable()
export class GraphAppTokenService {
  private cache: { token: string; expiresAt: number } | null = null

  configured(): boolean {
    return !!(process.env.AZURE_AD_TENANT_ID && process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET)
  }

  async getToken(): Promise<string> {
    if (this.cache && Date.now() < this.cache.expiresAt - 60_000) return this.cache.token
    const tenantId = process.env.AZURE_AD_TENANT_ID
    const body = new URLSearchParams({
      client_id: process.env.AZURE_AD_CLIENT_ID!,
      client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    })
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    })
    const json: any = await res.json()
    if (!res.ok) throw new Error(`Graph token ${res.status}: ${json.error_description || json.error}`)
    this.cache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 }
    return this.cache.token
  }
}
