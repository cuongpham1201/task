import { useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import { apiFetch } from '../api/client'
import BrandLogo from '../components/shared/BrandLogo'
import { isInTeamsHostFast, authenticateInTeams } from '../utils/teams'

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
        // FEATURE-001: mật khẩu tạm → kiểm tra TRƯỚC khi gọi /bootstrap
        // (AuthGuard chặn /bootstrap 403 khi mustChangePassword → nếu vẫn gọi sẽ rơi
        // vào catch và hiện nhầm "Không kết nối được" thay vì màn đổi mật khẩu).
        if (me.mustChangePassword) {
          if (!cancelled) setData({ me, bootstrap: null })
          return
        }
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
  // FEATURE-001: bắt buộc đổi mật khẩu tạm trước khi dùng app
  if (data.me.mustChangePassword) return <ChangePasswordScreen />
  return children(data.me, data.bootstrap)
}

function LoginScreen({ onLogin }) {
  const [teamsBusy, setTeamsBusy] = useState(false)
  const [teamsFail, setTeamsFail] = useState(false)
  const inTeams = isInTeamsHostFast()

  // Trong Teams iframe: OAuth redirect bị Entra chặn → dùng Teams auth POPUP
  // (pattern approval). Thành công → reload để LoginGate đọc session mới.
  const login = async () => {
    if (!inTeams) return onLogin()
    setTeamsBusy(true); setTeamsFail(false)
    const ok = await authenticateInTeams()
    if (ok) window.location.reload()
    else { setTeamsBusy(false); setTeamsFail(true) }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <BrandLogo size={44} />
        </div>
        <h1 className="auth-title">App Giao Việc</h1>
        <p className="auth-sub">Hệ thống giao việc nội bộ — Bia Hạ Long</p>
        <button className="ms-btn" onClick={login} disabled={teamsBusy}>
          <MsLogo />
          <span>{teamsBusy ? 'Đang mở cửa sổ đăng nhập…' : 'Đăng nhập với Microsoft 365'}</span>
        </button>
        {teamsFail && (
          <p className="auth-foot" style={{ color: '#dd4b4b' }}>
            Không đăng nhập được trong Teams. Hãy thử lại, hoặc mở{' '}
            <a href={window.location.origin} target="_blank" rel="noreferrer">task.biahalong.com</a>{' '}
            trong trình duyệt để đăng nhập trước.
          </p>
        )}
        <div className="auth-divider"><span>hoặc đăng nhập nội bộ</span></div>
        <LocalLoginForm />
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


/** FEATURE-001: đăng nhập nội bộ cho nhân viên không có M365. Lỗi hiển thị CHUNG. */
function LocalLoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password || busy) return
    setBusy(true); setErr('')
    try {
      await apiFetch('/auth/local/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      })
      window.location.reload() // LoginGate đọc session mới; mustChangePassword sẽ tự gate
    } catch {
      setErr('Tên đăng nhập hoặc mật khẩu không đúng')
      setBusy(false)
    }
  }

  return (
    <form className="local-login" onSubmit={submit}>
      <input placeholder="Tên đăng nhập" autoComplete="username"
        value={username} onChange={(e) => setUsername(e.target.value)} />
      <input type="password" placeholder="Mật khẩu" autoComplete="current-password"
        value={password} onChange={(e) => setPassword(e.target.value)} />
      {err && <p className="form-error">{err}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !username.trim() || !password}>
        {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
    </form>
  )
}

/** Màn đổi mật khẩu BẮT BUỘC (mustChangePassword) — không cho vào app trước khi đổi xong. */
function ChangePasswordScreen() {
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (newPassword.length < 8) { setErr('Mật khẩu mới phải từ 8 ký tự'); return }
    if (newPassword !== confirm) { setErr('Xác nhận mật khẩu không khớp'); return }
    setBusy(true); setErr('')
    try {
      await apiFetch('/auth/local/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
      })
      window.location.reload()
    } catch (e2) {
      setErr(e2.status === 401 ? 'Mật khẩu hiện tại không đúng' : 'Đổi mật khẩu thất bại — kiểm tra lại')
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo"><BrandLogo size={40} /></div>
        <h1 className="auth-title">Đổi mật khẩu</h1>
        <p className="auth-sub">Bạn đang dùng mật khẩu tạm — hãy đặt mật khẩu mới để tiếp tục.</p>
        <form className="local-login" onSubmit={submit}>
          <input type="password" placeholder="Mật khẩu tạm (hiện tại)" autoComplete="current-password"
            value={oldPassword} onChange={(e) => setOld(e.target.value)} />
          <input type="password" placeholder="Mật khẩu mới (≥ 8 ký tự)" autoComplete="new-password"
            value={newPassword} onChange={(e) => setNew(e.target.value)} />
          <input type="password" placeholder="Nhập lại mật khẩu mới" autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {err && <p className="form-error">{err}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Đổi mật khẩu và tiếp tục'}
          </button>
        </form>
      </div>
    </div>
  )
}
