import { useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import { apiFetch } from '../api/client'
import BrandLogo from '../components/shared/BrandLogo'

/**
 * Cổng đăng nhập + bootstrap dữ liệu thật.
 *  - Gọi /me rồi /bootstrap (kèm cookie session).
 *  - 401 → màn đăng nhập (redirect API /auth/login).
 *  - children là render-prop: (me, bootstrap) => ReactNode.
 */
export default function LoginGate({ children }) {
  const auth = useAuth()
  const [data, setData] = useState(undefined) // {me, bootstrap} | null
  const [needLogin, setNeedLogin] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const me = await apiFetch('/me')
        const bootstrap = await apiFetch('/bootstrap')
        if (!cancelled) setData({ me, bootstrap })
      } catch (e) {
        if (cancelled) return
        if (e.status === 401) {
          setNeedLogin(true)
        } else {
          setError(e.message)
        }
        setData(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (needLogin) return <LoginScreen onLogin={auth.login} />
  if (error) return <ErrorScreen message={error} onRetry={() => window.location.reload()} />
  if (data === undefined || data === null) return <LoadingScreen />
  return children(data.me, data.bootstrap)
}

function LoginScreen({ onLogin }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <BrandLogo size={44} />
        </div>
        <h1 className="auth-title">App Giao Việc</h1>
        <p className="auth-sub">Hệ thống giao việc nội bộ — Bia Hạ Long</p>
        <button className="ms-btn" onClick={onLogin}>
          <MsLogo />
          <span>Đăng nhập với Microsoft 365</span>
        </button>
        <p className="auth-foot">Chỉ dành cho tài khoản nội bộ @biahalong.com</p>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-loading">
        <span className="spinner" />
        <span>Đang tải…</span>
      </div>
    </div>
  )
}

function ErrorScreen({ message, onRetry }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo"><BrandLogo size={40} /></div>
        <h1 className="auth-title">Không kết nối được</h1>
        <p className="auth-sub">{message}</p>
        <button className="ms-btn" onClick={onRetry}>Thử lại</button>
      </div>
    </div>
  )
}

// Logo Microsoft 4 ô vuông
function MsLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
