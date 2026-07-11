/**
 * Microsoft Teams host integration — pattern approval-bhl teams-client.ts (v2 npm SDK,
 * dynamic import để KHÔNG ảnh hưởng browser/PWA; init timeout để không hang ngoài Teams).
 */

let sdkPromise = null
function loadSdk() {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (!sdkPromise) {
    sdkPromise = import('@microsoft/teams-js').catch(() => null)
  }
  return sdkPromise
}

/** Heuristic nhanh (đồng bộ): đang chạy trong Teams? (iframe + param/UA gợi ý) */
export function isInTeamsHostFast() {
  if (typeof window === 'undefined') return false
  try {
    const inIframe = window.parent !== window
    const p = new URLSearchParams(window.location.search)
    const hasTeamsParam = p.has('frameContext') || p.get('source') === 'teams' || p.has('inTeams')
    const ua = (navigator.userAgent || '').toLowerCase()
    return inIframe || hasTeamsParam || ua.includes('teams/') || ua.includes('microsoftteams')
  } catch {
    return false
  }
}

let initPromise = null
const INIT_TIMEOUT_MS = 3000

/** Init TeamsJS — true nếu thật sự trong Teams; timeout → false (browser thường). */
export function initTeams() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const sdk = await loadSdk()
    if (!sdk) return false
    try {
      return await Promise.race([
        sdk.app.initialize().then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), INIT_TIMEOUT_MS)),
      ])
    } catch {
      return false
    }
  })()
  return initPromise
}

/** Đọc subEntityId từ Teams context (deep link Activity Feed) — null nếu không có/không trong Teams. */
export async function getTeamsSubEntityId() {
  const ok = await initTeams()
  if (!ok) return null
  const sdk = await loadSdk()
  try {
    const ctx = await sdk.app.getContext()
    return ctx?.page?.subPageId || null
  } catch {
    return null
  }
}

/**
 * Đăng nhập TRONG Teams: OAuth redirect trong iframe bị Entra chặn (X-Frame-Options)
 * → mở qua Teams auth POPUP (top-level, first-party) — pattern approval-bhl.
 * Popup: /api/v1/auth/login?teams=1 → M365 → callback set cookie → /auth/teams-complete
 * → notifySuccess → promise resolve → caller reload app.
 * Trả true nếu login xong; false nếu fail/cancel (caller hiện fallback).
 */
export async function authenticateInTeams() {
  const ok = await initTeams()
  if (!ok) return false
  const sdk = await loadSdk()
  try {
    await sdk.authentication.authenticate({
      url: `${window.location.origin}/api/v1/auth/login?teams=1`,
      width: 600,
      height: 640,
    })
    return true
  } catch {
    return false
  }
}

/** Gọi từ trang /auth/teams-complete (chạy trong popup) để báo kết quả cho tab cha. */
export async function notifyTeamsAuthResult(success) {
  const sdk = await loadSdk()
  try {
    await sdk.app.initialize()
    if (success) sdk.authentication.notifySuccess('ok')
    else sdk.authentication.notifyFailure('no-session')
    return true
  } catch {
    return false // không trong Teams popup → caller tự điều hướng
  }
}
