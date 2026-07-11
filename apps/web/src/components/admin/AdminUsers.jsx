import { useEffect, useMemo, useState } from 'react'
import { KeyRound, RefreshCw, Lock, Unlock, ScrollText, ShieldCheck, X } from 'lucide-react'
import { apiFetch } from '../../api/client'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'
import OrgRolesModal from './OrgRolesModal'
import { deaccent } from '../../utils/text'
import { orgUnitLabel, orgUnitShortLabel } from '../../utils/org'
import { ROLES } from '../../data/constants'

// FEATURE-004: hình thức đăng nhập gộp — admin thấy ngay ai M365 / Local / chưa cấp
const loginKind = (u) =>
  u.hasEntra && u.hasLocal ? 'M365 + Local' : u.hasEntra ? 'M365' : u.hasLocal ? 'Local' : 'Chưa cấp'
const loginTone = (u) =>
  u.hasEntra && u.hasLocal ? 'tone-purple' : u.hasEntra ? 'tone-blue' : u.hasLocal ? 'tone-green' : 'tone-gray'

/**
 * FEATURE-001 — Tab "Người dùng" (admin). HRM là master tên/phòng/chức danh (read-only);
 * admin chỉ quản lý đăng nhập/khóa/role. Mật khẩu tạm hiển thị ĐÚNG 1 LẦN.
 */
export default function AdminUsers() {
  const { state, toast } = useApp()
  const [users, setUsers] = useState(null)
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [flt, setFlt] = useState('all') // all|active|inactive|entra|local|nologin|locked|noaccess
  const [cred, setCred] = useState(null) // {displayName, username, tempPassword} — 1 lần
  const [logFor, setLogFor] = useState(null) // {user, rows}
  const [rolesFor, setRolesFor] = useState(null) // FEATURE-003: user đang mở modal vai trò tổ chức
  const [busyId, setBusyId] = useState(null)

  const load = () => apiFetch('/admin/users').then(setUsers).catch(() => toast('Không tải được danh sách'))
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  const deptById = useMemo(() => Object.fromEntries(state.departments.map((d) => [d.id, d])), [state.departments])

  const filtered = useMemo(() => {
    if (!users) return []
    const qq = deaccent(q)
    return users.filter((u) => {
      if (qq && !deaccent(`${u.displayName} ${u.email} ${u.username || ''} ${u.empCode || ''}`).includes(qq)) return false
      if (dept && u.orgUnitId !== dept) return false
      switch (flt) {
        case 'active': return u.active
        case 'inactive': return !u.active
        case 'entra': return u.hasEntra
        case 'local': return u.hasLocal
        case 'noaccess': return !u.hasEntra && !u.hasLocal
        case 'nologin': return !u.lastLoginAt
        case 'locked': return u.locked
        default: return true
      }
    })
  }, [users, q, dept, flt])

  const act = async (u, fn, okMsg) => {
    setBusyId(u.id)
    try { await fn(); await load(); if (okMsg) toast(okMsg, 'success') }
    catch (e) { toast('Thao tác thất bại: ' + e.message) }
    finally { setBusyId(null) }
  }
  const provision = (u) => act(u, async () => {
    const r = await apiFetch(`/admin/users/${u.id}/provision-local`, { method: 'POST', body: JSON.stringify({}) })
    setCred({ displayName: u.displayName, ...r })
  })
  const resetPw = (u) => act(u, async () => {
    if (!window.confirm(`Reset mật khẩu của ${u.displayName}?`)) return
    const r = await apiFetch(`/admin/users/${u.id}/reset-password`, { method: 'POST' })
    setCred({ displayName: u.displayName, ...r })
  })
  const setAccess = (u, patch, msg) => act(u, () =>
    apiFetch(`/admin/users/${u.id}/access`, { method: 'PATCH', body: JSON.stringify(patch) }), msg)
  const setRole = (u, role) => act(u, () =>
    apiFetch(`/admin/users/${u.id}/roles`, { method: 'PATCH', body: JSON.stringify({ role }) }), 'Đã đổi role')
  const showLog = async (u) => {
    const rows = await apiFetch(`/admin/users/${u.id}/audit-log`).catch(() => [])
    setLogFor({ user: u, rows })
  }

  if (!users) return <p className="muted" style={{ padding: 8 }}>Đang tải danh sách người dùng…</p>

  return (
    <>
      <div className="filter-row">
        <input placeholder="Tìm tên / email / username / mã NV…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
        <select value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">Mọi đơn vị biên chế</option>
          {state.departments.map((d) => <option key={d.id} value={d.id}>{orgUnitLabel(d)}</option>)}
        </select>
        <select value={flt} onChange={(e) => setFlt(e.target.value)}>
          <option value="all">Tất cả</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Ngưng hoạt động</option>
          <option value="entra">Có M365</option>
          <option value="local">Có local login</option>
          <option value="noaccess">Chưa có cách đăng nhập</option>
          <option value="nologin">Chưa từng đăng nhập</option>
          <option value="locked">Đang bị khóa</option>
        </select>
        <span className="muted">{filtered.length}/{users.length}</span>
      </div>

      <div className="table-wrap">
        <table className="task-table admin-users-table">
          <thead>
            <tr>
              <th>Nhân viên</th><th>Mã NV</th><th>Chức danh (HRM)</th><th>Đơn vị biên chế</th><th>Đăng nhập</th>
              <th>Trạng thái</th><th>Lần cuối</th><th>Role</th><th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((u) => (
              <tr key={u.id} className={!u.active ? 'row-inactive' : ''}>
                <td>
                  <span className="cell-user">
                    <Avatar user={u} size={26} />{' '}
                    <span>
                      {u.displayName}
                      <br /><small className="muted">{u.email}</small>
                      {u.username && <><br /><small className="muted">username: <code>{u.username}</code></small></>}
                    </span>
                  </span>
                </td>
                <td>{u.empCode || '—'}</td>
                <td className="muted">{u.jobTitle || '—'}</td>
                <td>{deptById[u.orgUnitId] ? orgUnitShortLabel(deptById[u.orgUnitId]) : (u.orgUnitName || '—')}</td>
                <td><span className={`badge ${loginTone(u)}`}>{loginKind(u)}</span></td>
                <td>
                  {!u.active ? <span className="badge tone-gray">Ngưng</span>
                    : u.locked ? <span className="badge tone-red">Khóa tạm</span>
                    : u.mustChangePassword ? <span className="badge tone-amber">Chờ đổi MK</span>
                    : <span className="badge tone-green">OK</span>}
                </td>
                <td className="muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('vi') : 'Chưa'}</td>
                <td>
                  {/* FEATURE-004: role kỹ thuật chỉ Admin/Nhân viên — trưởng phòng = vai trò tổ chức (nút khiên) */}
                  <select value={ROLES[u.role] ? u.role : 'member'} disabled={busyId === u.id} onChange={(e) => setRole(u, e.target.value)}>
                    {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="admin-actions">
                  {!u.username ? (
                    <button className="btn btn-sm" disabled={busyId === u.id} onClick={() => provision(u)} title="Cấp tài khoản local">
                      <KeyRound size={13} /> Cấp TK
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-ghost" disabled={busyId === u.id} onClick={() => resetPw(u)} title="Reset mật khẩu"><RefreshCw size={14} /></button>
                      {u.locked && <button className="btn btn-ghost" onClick={() => setAccess(u, { unlock: true }, 'Đã mở khóa')} title="Mở khóa"><Unlock size={14} /></button>}
                      <button className="btn btn-ghost" onClick={() => setAccess(u, { localLoginEnabled: !u.localLoginEnabled }, u.localLoginEnabled ? 'Đã tắt local login' : 'Đã bật local login')} title={u.localLoginEnabled ? 'Tắt local login' : 'Bật local login'}>
                        <Lock size={14} />
                      </button>
                    </>
                  )}
                  <button className="btn btn-ghost" onClick={() => setRolesFor(u)} title="Vai trò tổ chức & phạm vi dữ liệu"><ShieldCheck size={14} /></button>
                  <button className="btn btn-ghost" onClick={() => showLog(u)} title="Nhật ký quản trị"><ScrollText size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 200 && <p className="muted" style={{ padding: 8 }}>Hiển thị 200 đầu — dùng bộ lọc để thu hẹp.</p>}
      </div>

      {cred && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setCred(null)}>
          <div className="modal" style={{ width: 460 }}>
            <div className="modal-head"><h2>Thông tin đăng nhập — {cred.displayName}</h2>
              <button className="btn btn-ghost" onClick={() => setCred(null)}><X size={18} /></button></div>
            <div className="modal-body">
              <p><strong>Tên đăng nhập:</strong> <code>{cred.username}</code></p>
              <p><strong>Mật khẩu tạm:</strong> <code>{cred.tempPassword}</code></p>
              <p className="form-error">⚠ Mật khẩu chỉ hiển thị MỘT LẦN — gửi cho nhân viên ngay.
                Lần đăng nhập đầu sẽ bắt buộc đổi mật khẩu.</p>
            </div>
            <div className="modal-foot"><button className="btn btn-primary" onClick={() => setCred(null)}>Đã lưu lại — đóng</button></div>
          </div>
        </div>
      )}

      {rolesFor && <OrgRolesModal user={rolesFor} onClose={() => setRolesFor(null)} />}

      {logFor && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setLogFor(null)}>
          <div className="modal" style={{ width: 520 }}>
            <div className="modal-head"><h2>Nhật ký quản trị — {logFor.user.displayName}</h2>
              <button className="btn btn-ghost" onClick={() => setLogFor(null)}><X size={18} /></button></div>
            <div className="modal-body">
              {logFor.rows.length === 0 && <p className="muted">Chưa có thao tác nào.</p>}
              {logFor.rows.map((r) => (
                <p key={r.id} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <strong>{r.action}</strong> — {r.actorName} · {new Date(r.createdAt).toLocaleString('vi')}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
