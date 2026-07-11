import { useEffect, useMemo, useState } from 'react'
import { X, Plus, Eye, Pencil, Power, ShieldCheck } from 'lucide-react'
import { apiFetch } from '../../api/client'
import { useApp } from '../../store/AppContext'

/**
 * FEATURE-003 — "Vai trò tổ chức & phạm vi dữ liệu" (admin).
 * - HRM là master danh tính (đọc-chỉ); App tự quản quyền qua org_unit_roles.
 * - KHÔNG suy quyền từ jobTitle. Preview phạm vi LẤY TỪ BACKEND (không tính lại ở FE).
 * - Xóa = vô hiệu hóa (archive, giữ lịch sử audit) — không hard delete.
 */
const ROLE_LABEL = { ceo: 'Tổng giám đốc', block_director: 'Giám đốc khối', department_manager: 'Trưởng phòng/ban', viewer: 'Người xem' }
const SCOPE_LABEL = { self_only: 'Chỉ đơn vị này', include_children: 'Gồm đơn vị con' }
const TYPE_LABEL = { company: 'Công ty', block: 'Khối', department: 'Phòng/ban' }
const SOURCE_LABEL = { MANUAL: 'Admin gán', HRM_SYNC: 'HRM sync', MANUAL_TEST: 'Seed test', SEED: 'Seed' }
const EMPTY_FORM = { role: 'department_manager', orgUnitId: '', scope: 'self_only', note: '' }

export default function OrgRolesModal({ user, onClose }) {
  const { toast } = useApp()
  const [roles, setRoles] = useState(null)
  const [orgUnits, setOrgUnits] = useState([])
  const [effective, setEffective] = useState(null)
  const [form, setForm] = useState(null) // null | {id?, role, orgUnitId, scope, note}
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => Promise.all([
    apiFetch(`/admin/users/${user.id}/org-roles`).then(setRoles),
    apiFetch(`/admin/users/${user.id}/effective-scope`).then(setEffective),
  ]).catch(() => toast('Không tải được vai trò tổ chức'))

  useEffect(() => {
    load()
    apiFetch('/admin/org-units').then(setOrgUnits).catch(() => {})
    // eslint-disable-next-line
  }, [user.id])

  const orgById = useMemo(() => Object.fromEntries(orgUnits.map((o) => [o.id, o])), [orgUnits])
  const orgLabel = (o) => {
    if (!o) return '—'
    const parent = o.parentId ? orgById[o.parentId] : null
    return `${parent ? parent.name + ' → ' : ''}${o.name}${o.active ? '' : ' (NGƯNG)'}`
  }
  const grouped = useMemo(() => ({
    company: orgUnits.filter((o) => o.type === 'company'),
    block: orgUnits.filter((o) => o.type === 'block'),
    department: orgUnits.filter((o) => o.type === 'department'),
  }), [orgUnits])

  const showWarnings = (warnings) => (warnings || []).forEach((w) => toast(w, 'warn'))

  const doPreview = async () => {
    if (!form?.orgUnitId) return toast('Chọn đơn vị trước khi xem phạm vi', 'warn')
    setBusy(true)
    try {
      const p = await apiFetch('/admin/org-role-preview', {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, role: form.role, orgUnitId: form.orgUnitId, scope: form.scope }),
      })
      setPreview(p)
    } catch (e) { toast('Không xem được preview: ' + e.message) }
    finally { setBusy(false) }
  }

  const save = async () => {
    if (!form?.orgUnitId) return toast('Chưa chọn đơn vị', 'warn')
    setBusy(true)
    try {
      const body = JSON.stringify({ role: form.role, orgUnitId: form.orgUnitId, scope: form.scope, note: form.note || undefined })
      const r = form.id
        ? await apiFetch(`/admin/users/${user.id}/org-roles/${form.id}`, { method: 'PATCH', body })
        : await apiFetch(`/admin/users/${user.id}/org-roles`, { method: 'POST', body })
      showWarnings(r.warnings)
      toast(form.id ? 'Đã cập nhật vai trò' : 'Đã gán vai trò', 'success')
      setForm(null); setPreview(null); await load()
    } catch (e) {
      toast(e.status === 409 ? 'Assignment này đã tồn tại và đang active' : 'Lưu thất bại: ' + e.message)
    } finally { setBusy(false) }
  }

  const setActive = async (r, active) => {
    setBusy(true)
    try {
      const res = await apiFetch(`/admin/users/${user.id}/org-roles/${r.id}`, { method: 'PATCH', body: JSON.stringify({ active }) })
      showWarnings(res.warnings)
      toast(active ? 'Đã kích hoạt lại' : 'Đã vô hiệu hóa', 'success')
      await load()
    } catch (e) { toast('Thao tác thất bại: ' + e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 760, maxWidth: '95vw' }}>
        <div className="modal-head">
          <h2><ShieldCheck size={17} style={{ verticalAlign: -3 }} /> Vai trò tổ chức — {user.displayName}</h2>
          <button className="btn btn-ghost" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          {/* Thông tin HRM — READ-ONLY (App không sửa master data nhân sự) */}
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ margin: 0 }}>
              <strong>{user.displayName}</strong>
              {user.empCode && <> · Mã NV: <code>{user.empCode}</code></>}
              {!user.active && <> · <span className="badge tone-gray">NGƯNG HOẠT ĐỘNG</span></>}
            </p>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Chức danh (HRM): {user.jobTitle || '—'} · Phòng ban (HRM): {user.orgUnitName || '—'} ·{' '}
              {user.hasEntra && <span className="badge tone-blue">M365</span>}{' '}
              {user.hasLocal && <span className="badge tone-green">Local</span>}
            </p>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              Chức danh HRM chỉ để hiển thị — quyền nghiệp vụ do vai trò tổ chức bên dưới quyết định.
            </p>
          </div>

          {/* Quyền hiệu lực hiện tại (backend tính) */}
          {effective && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-head"><h2>Quyền hiệu lực hiện tại</h2></div>
              {effective.warnings?.map((w, i) => <p key={i} className="form-error">{w}</p>)}
              <p style={{ margin: 0 }}>
                Xem: <strong>{effective.visibleOrgUnitIds.length}</strong> đơn vị · Quản lý:{' '}
                <strong>{effective.manageableOrgUnitIds.length}</strong> đơn vị ·{' '}
                Action Log: {effective.permissions.canViewActionLog ? '✓' : '✗'} ·{' '}
                Thống kê: {effective.permissions.canViewReports ? '✓' : '✗'}
              </p>
              {effective.orgUnits.length > 0 && (
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                  {effective.orgUnits.map((o) => `${o.name}${effective.manageableOrgUnitIds.includes(o.id) ? ' (quản lý)' : ''}`).join(' · ')}
                </p>
              )}
            </div>
          )}

          {/* Danh sách assignment */}
          <div className="card-head" style={{ marginBottom: 6 }}>
            <h2>Assignment ({roles ? roles.length : '…'})</h2>
            {!form && (
              <button className="btn btn-primary" onClick={() => { setForm({ ...EMPTY_FORM }); setPreview(null) }}>
                <Plus size={15} /> Thêm vai trò
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table className="task-table settings-table">
              <thead>
                <tr><th>Vai trò</th><th>Đơn vị</th><th>Loại</th><th>Phạm vi</th><th>Nguồn</th><th>Trạng thái</th><th>Người gán</th><th>Ngày</th><th></th></tr>
              </thead>
              <tbody>
                {(roles || []).map((r) => (
                  <tr key={r.id} className={r.active ? '' : 'row-inactive'}>
                    <td><strong>{ROLE_LABEL[r.role] || r.role}</strong></td>
                    <td>{r.orgUnit?.name || '—'}{r.orgUnit && !r.orgUnit.active && <span className="badge tone-red" style={{ marginLeft: 4 }}>ĐV ngưng</span>}</td>
                    <td>{TYPE_LABEL[r.orgUnit?.type] || r.orgUnit?.type || '—'}</td>
                    <td>{SCOPE_LABEL[r.scope]}</td>
                    <td><span className="badge tone-gray">{SOURCE_LABEL[r.source] || r.source}</span></td>
                    <td>{r.active ? <span className="badge tone-green">Active</span> : <span className="badge tone-gray">Ngưng</span>}</td>
                    <td className="muted">{r.createdByName || '—'}</td>
                    <td className="muted">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('vi') : '—'}</td>
                    <td className="admin-actions">
                      <button className="btn btn-ghost" disabled={busy} title="Sửa"
                        onClick={() => { setForm({ id: r.id, role: r.role, orgUnitId: r.orgUnit?.id || '', scope: r.scope, note: r.note || '' }); setPreview(null) }}>
                        <Pencil size={14} />
                      </button>
                      <button className="btn btn-ghost" disabled={busy} title={r.active ? 'Vô hiệu hóa' : 'Kích hoạt lại'}
                        onClick={() => setActive(r, !r.active)}>
                        <Power size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {roles && roles.length === 0 && (
                  <tr><td colSpan={9} className="muted">Chưa có vai trò tổ chức — user chỉ thấy việc cá nhân/phòng mình theo mặc định.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Form thêm/sửa + preview phạm vi từ backend */}
          {form && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-head"><h2>{form.id ? 'Sửa vai trò' : 'Thêm vai trò'}</h2></div>
              <div className="filter-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <select value={form.role} onChange={(e) => { setForm({ ...form, role: e.target.value, scope: e.target.value === 'department_manager' ? 'self_only' : 'include_children' }); setPreview(null) }}>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={form.orgUnitId} onChange={(e) => { setForm({ ...form, orgUnitId: e.target.value }); setPreview(null) }} style={{ minWidth: 240 }}>
                  <option value="">— Chọn đơn vị —</option>
                  <optgroup label="Công ty">{grouped.company.map((o) => <option key={o.id} value={o.id}>{orgLabel(o)}</option>)}</optgroup>
                  <optgroup label="Khối">{grouped.block.map((o) => <option key={o.id} value={o.id}>{orgLabel(o)}</option>)}</optgroup>
                  <optgroup label="Phòng/ban">{grouped.department.map((o) => <option key={o.id} value={o.id}>{orgLabel(o)}</option>)}</optgroup>
                </select>
                <select value={form.scope} onChange={(e) => { setForm({ ...form, scope: e.target.value }); setPreview(null) }}>
                  {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <input style={{ marginTop: 8, width: '100%' }} placeholder="Ghi chú / lý do (tùy chọn, ghi vào audit)"
                value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} />

              {preview && (
                <div style={{ marginTop: 10, padding: 10, background: 'var(--gray-soft)', borderRadius: 8 }}>
                  {preview.warnings?.map((w, i) => <p key={i} className="form-error" style={{ margin: '0 0 6px' }}>⚠ {w}</p>)}
                  <p style={{ margin: 0 }}>
                    <strong>Quyền hiệu lực dự kiến:</strong> xem {preview.visibleOrgUnitIds.length} đơn vị · quản lý {preview.manageableOrgUnitIds.length} đơn vị
                  </p>
                  <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                    {preview.orgUnits
                      .filter((o) => preview.visibleOrgUnitIds.includes(o.id) || preview.manageableOrgUnitIds.includes(o.id))
                      .map((o) => `${preview.addedOrgUnitIds.includes(o.id) ? '＋' : '✓'} ${o.name}`)
                      .join(' · ')}
                  </p>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 11 }}>＋ = mở thêm bởi vai trò đang gán · ✓ = đã có sẵn</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn" disabled={busy || !form.orgUnitId} onClick={doPreview}><Eye size={15} /> Xem phạm vi</button>
                <button className="btn btn-primary" disabled={busy || !form.orgUnitId} onClick={save}>{form.id ? 'Cập nhật' : 'Gán vai trò'}</button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => { setForm(null); setPreview(null) }}>Hủy</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
