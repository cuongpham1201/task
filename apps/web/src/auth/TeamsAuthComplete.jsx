import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { notifyTeamsAuthResult } from '../utils/teams'

/**
 * /auth/teams-complete — đích sau OAuth trong Teams POPUP (pattern approval /teams/auth-end).
 * Chạy trong popup (top-level, first-party) → cookie session vừa set ĐỌC ĐƯỢC ở đây.
 * VERIFY /me trước khi báo success (không coi redirect-thành-công là đủ).
 * Mở ngoài Teams (không phải popup) → tự về trang chủ.
 */
const MAX_ATTEMPTS = 6
const DELAY_MS = 400

export default function TeamsAuthComplete() {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let ok = false
      for (let i = 1; i <= MAX_ATTEMPTS && !cancelled; i++) {
        try { const me = await apiFetch('/me'); ok = !!me?.email } catch { ok = false }
        if (ok) break
        await new Promise((r) => setTimeout(r, DELAY_MS))
      }
      if (cancelled) return
      const notified = await notifyTeamsAuthResult(ok)
      if (!notified) {
        // Không trong Teams popup → điều hướng thường
        window.location.replace('/')
        return
      }
      if (!ok) setFailed(true)
      // notifySuccess → Teams tự đóng popup; notifyFailure → hiện thông báo dưới
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-title">{failed ? 'Đăng nhập chưa hoàn tất' : 'Đang hoàn tất đăng nhập…'}</h1>
        <p className="auth-sub">
          {failed
            ? 'Không xác nhận được phiên đăng nhập. Hãy đóng cửa sổ này và thử lại, hoặc mở app trong trình duyệt.'
            : 'Cửa sổ này sẽ tự đóng.'}
        </p>
      </div>
    </div>
  )
}
