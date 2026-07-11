import { useState } from 'react'
import { LogOut, RefreshCw } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../auth/AuthProvider'
import { apiFetch } from '../api/client'
import Avatar from '../components/shared/Avatar'
import AdminUsers from '../components/admin/AdminUsers'
import { ROLES } from '../data/constants'

export default function Settings() {
  const { state, currentUser } = useApp()
  const { logout } = useAuth()
  const isAdmin = currentUser.role === 'admin'
  const dept = state.departments.find((d) => d.id === currentUser.orgUnitId)
  const [tab, setTab] = useState('account')

  const TABS = [
    { key: 'account', label: 'Tài khoản' },
    ...(isAdmin ? [
      { key: 'users', label: 'Người dùng' },
      { key: 'departments', label: 'Phòng ban' },
      { key: 'hrm', label: 'Đồng bộ HRM' },
    ] : []),
  ]

  return (
    <div className={tab === 'users' ? 'page' : 'page page-narrow'}>
      <div className="page-head"><h1>Cài đặt</h1></div>

      {TABS.length > 1 && (
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
      )}

      {tab === 'account' && (
        <div className="card">
          <div className="card-head"><h2>Tài khoản</h2></div>
          <div className="settings-profile">
            <Avatar user={currentUser} size={56} />
            <div>
              <p className="settings-name">{currentUser.displayName}</p>
              <p className="muted">{currentUser.email}</p>
              <p className="muted">{dept?.name ? `${dept.name} · ` : ''}{ROLES[currentUser.role]}</p>
            </div>
          </div>
          <p className="muted settings-hint" style={{ marginTop: 12 }}>
            Đăng nhập bằng Microsoft 365 hoặc tài khoản nội bộ do quản trị viên cấp.
            Thông tin phòng ban/chức danh đồng bộ từ hệ thống Nhân sự.
          </p>
          <button className="btn" onClick={logout}><LogOut size={15} /> Đăng xuất</button>
        </div>
      )}

      {tab === 'users' && isAdmin && (
        <div className="card"><div className="card-head"><h2>Người dùng</h2></div><AdminUsers /></div>
      )}

      {tab === 'departments' && isAdmin && (
        <div className="card">
          <div className="card-head"><h2>Phòng ban (từ HRM — read-only)</h2></div>
          <div className="table-wrap">
            <table className="task-table settings-table">
              <thead><tr><th>Phòng ban</th><th>Mã</th><th>Trưởng phòng</th><th>Số thành viên</th></tr></thead>
              <tbody>
                {state.departments.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td><td>{d.code}</td><td>{d.managerName || '—'}</td>
                    <td>{state.users.filter((u) => u.orgUnitId === d.id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'hrm' && isAdmin && <HrmSyncTab />}
    </div>
  )
}

/** FEATURE-001: Đồng bộ HRM — xem log + chạy tay (idempotent). */
function HrmSyncTab() {
  const { toast } = useApp()
  const [logs, setLogs] = useState(null)
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState('')

  const load = () => apiFetch('/admin/hrm-sync/logs').then(setLogs).catch(() => setLogs([]))
  useState(() => { load() }) // chạy 1 lần khi mount

  const run = async () => {
    if (!window.confirm('Chạy đồng bộ HRM ngay? (idempotent — không tạo trùng)')) return
    setRunning(true); setOutput('')
    try {
      const r = await apiFetch('/admin/hrm-sync/run', { method: 'POST' })
      setOutput(r.output || r.error || '')
      toast(r.ok ? 'Đồng bộ xong' : 'Đồng bộ lỗi — xem output', r.ok ? 'success' : 'error')
      load()
    } catch (e) { toast('Không chạy được sync: ' + e.message) }
    finally { setRunning(false) }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Đồng bộ HRM</h2>
        <button className="btn btn-primary" disabled={running} onClick={run}>
          <RefreshCw size={15} /> {running ? 'Đang chạy…' : 'Chạy đồng bộ'}
        </button>
      </div>
      <p className="muted settings-hint">HRM là nguồn master (nhân viên/phòng ban/chức danh). Sync một chiều, chạy lại không tạo trùng; nhân viên nghỉ → khóa đăng nhập, không xóa dữ liệu.</p>
      {output && <pre style={{ fontSize: 12, background: 'var(--gray-soft)', padding: 10, borderRadius: 8, overflowX: 'auto' }}>{output}</pre>}
      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="task-table settings-table">
          <thead><tr><th>Thời gian</th><th>Entity</th><th>Số bản ghi</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {(logs || []).map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.createdAt).toLocaleString('vi')}</td>
                <td>{l.entity}</td><td>{l.count}</td>
                <td>{l.status === 'ok' ? <span className="badge tone-green">OK</span> : <span className="badge tone-red">{l.status}</span>}</td>
              </tr>
            ))}
            {logs && logs.length === 0 && <tr><td colSpan={4} className="muted">Chưa có log đồng bộ.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
