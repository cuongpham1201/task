// Cấu hình SSO Azure AD (M365) — theo pattern app "văn bản"/"phê duyệt":
// luồng Authorization Code phía SERVER có client secret (confidential client),
// redirect URI kiểu Web, chặn domain công ty. Đặt tên biến AZURE_AD_* cho đồng
// nhất với các app kia.
//
// Chưa điền tenant/client/secret → enabled=false → API chạy CHẾ ĐỘ DEV
// (nhận danh tính qua header x-dev-user-email) để phát triển độc lập.

export interface AzureAdConfig {
  enabled: boolean
  tenantId: string
  clientId: string
  clientSecret: string
  redirectUri: string
  webOrigin: string
  /** Domain công ty duy nhất được đăng nhập, dạng "@biahalong.com". */
  allowedDomain: string
  authority: string
  authorizeUrl: string
  tokenUrl: string
  jwksUri: string
  issuer: string
  scopes: string
  sessionSecret: string
}

export function loadAzureAdConfig(): AzureAdConfig {
  const tenantId = (process.env.AZURE_AD_TENANT_ID || '').trim()
  const clientId = (process.env.AZURE_AD_CLIENT_ID || '').trim()
  const clientSecret = (process.env.AZURE_AD_CLIENT_SECRET || '').trim()
  const enabled = Boolean(tenantId && clientId && clientSecret)
  const authority = `https://login.microsoftonline.com/${tenantId}`
  const allowedDomainRaw = (process.env.ALLOWED_EMAIL_DOMAIN || 'biahalong.com').trim().toLowerCase()
  return {
    enabled,
    tenantId,
    clientId,
    clientSecret,
    redirectUri: (
      process.env.AUTH_REDIRECT_URI || 'http://localhost:3001/api/v1/auth/callback'
    ).trim(),
    webOrigin: (process.env.WEB_ORIGIN || 'http://localhost:5173').trim(),
    allowedDomain: '@' + allowedDomainRaw,
    authority,
    authorizeUrl: `${authority}/oauth2/v2.0/authorize`,
    tokenUrl: `${authority}/oauth2/v2.0/token`,
    jwksUri: `${authority}/discovery/v2.0/keys`,
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    // Delegated scopes tối thiểu (giống app kia); Graph mở rộng thêm ở Bước 2.
    scopes: 'openid profile email offline_access User.Read',
    sessionSecret: (
      process.env.SESSION_SECRET || 'dev-insecure-session-secret-change-me'
    ).trim(),
  }
}
