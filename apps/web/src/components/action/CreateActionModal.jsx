import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import SearchUser from '../shared/SearchUser'
import { PRIORITY, PRIORITY_ORDER } from '../../data/constants'
import { fromInputDate } from '../../utils/date'
import { orgUnitLabel } from '../../utils/org'

const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function CreateActionModal() {
  const { state, currentUser, closeCreateActionModal, createAction, visibleDepartments, visibleChannels } = useApp()
  const navigate = useNavigate()
  const defaults = state.createActionModal?.defaults || {}
  const deptOptions = visibleDepartments

  const [form, setForm] = useState(() => ({
    title: '',
    description: '',
    orgUnitId: deptOptions.some((d) => d.id === defaults.orgUnitId) ? defaults.orgUnitId
      : (deptOptions.find((d) => d.id === currentUser.orgUnitId)?.id || deptOptions[0]?.id || ''),
    projectId: '',
    ownerId: currentUser.id,
    deadline: '',
    priority: 'normal',
    period: thisMonth(),
  }))
  const [error, setError] = useState('')
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const submit = () => {
    if (!form.title.trim()) { setError('Nhập tên Action'); return }
    if (!form.orgUnitId) { setError('Chọn đơn vị chịu trách nhiệm'); return }
    const dto = {
      title: form.title.trim(),
      description: form.description.trim(),
      orgUnitId: form.orgUnitId,
      projectId: form.projectId || null,
      ownerId: form.ownerId,
      deadline: fromInputDate(form.deadline) || null,
      priority: form.priority,
      period: form.period || undefined,
    }
    createAction(dto, (a) => { closeCreateActionModal(); navigate(`/actions/${a.id}`) })
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && closeCreateActionModal()}>
      <div className="modal">
        <div className="modal-head">
          <h2>Tạo Action</h2>
          <button className="btn btn-ghost" onClick={closeCreateActionModal}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <label className="form-field">
            <span>Tên Action *</span>
            <input autoFocus placeholder="VD: Kiểm tra thuế Công ty Đông Mai" value={form.title}
              onChange={(e) => { set({ title: e.target.value }); setError('') }} />
            {error && <span className="form-error">{error}</span>}
          </label>
          <label className="form-field">
            <span>Mô tả</span>
            <textarea rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <div className="form-row">
            <label className="form-field">
              <span>Đơn vị chịu trách nhiệm *</span>
              <select value={form.orgUnitId} onChange={(e) => set({ orgUnitId: e.target.value })}>
                {deptOptions.map((d) => <option key={d.id} value={d.id}>{orgUnitLabel(d)}</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>Dự án (tùy chọn)</span>
              <select value={form.projectId} onChange={(e) => set({ projectId: e.target.value })}>
                <option value="">— Không —</option>
                {visibleChannels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <div className="form-row">
            <div className="form-field">
              <span>Owner (người chịu trách nhiệm báo cáo)</span>
              <SearchUser value={form.ownerId} onSelect={(id) => set({ ownerId: id || currentUser.id })} placeholder="Tìm owner…" />
            </div>
            <label className="form-field">
              <span>Ưu tiên</span>
              <select value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
                {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label className="form-field">
              <span>Deadline</span>
              <input type="date" value={form.deadline} onChange={(e) => set({ deadline: e.target.value })} />
            </label>
            <label className="form-field">
              <span>Kỳ (tháng)</span>
              <input type="month" value={form.period} onChange={(e) => set({ period: e.target.value })} />
            </label>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={closeCreateActionModal}>Hủy</button>
          <button className="btn btn-primary" onClick={submit}>Tạo Action</button>
        </div>
      </div>
    </div>
  )
}
