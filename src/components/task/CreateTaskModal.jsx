import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'
import { PRIORITY, PRIORITY_ORDER, SECTIONS, SECTION_ORDER, SCOPES } from '../../data/constants'
import { fromInputDate } from '../../utils/date'

export default function CreateTaskModal() {
  const { state, currentUser, closeCreateModal, createTask } = useApp()
  const defaults = state.createModal?.defaults || {}

  const [form, setForm] = useState(() => ({
    title: '',
    description: '',
    // Nhân viên mặc định tạo việc cá nhân, quản lý tạo việc phòng ban
    scope: defaults.scope || (currentUser.role === 'member' ? 'personal' : 'department'),
    departmentId: defaults.departmentId || currentUser.departmentId,
    channelId: defaults.channelId || state.channels[0]?.id,
    section: defaults.section || 'suvu',
    assigneeId: currentUser.id,
    collaboratorIds: [],
    startDate: '',
    dueDate: '',
    priority: 'normal',
  }))
  const [subtaskTitles, setSubtaskTitles] = useState([])
  const [subtaskInput, setSubtaskInput] = useState('')
  const [error, setError] = useState('')

  if (!state.createModal) return null

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const toggleCollaborator = (id) =>
    set({
      collaboratorIds: form.collaboratorIds.includes(id)
        ? form.collaboratorIds.filter((x) => x !== id)
        : [...form.collaboratorIds, id],
    })

  const addSubtaskTitle = () => {
    const t = subtaskInput.trim()
    if (!t) return
    setSubtaskTitles((list) => [...list, t])
    setSubtaskInput('')
  }

  const submit = () => {
    if (!form.title.trim()) {
      setError('Vui lòng nhập tên công việc')
      return
    }
    createTask(
      {
        title: form.title.trim(),
        description: form.description.trim(),
        scope: form.scope,
        departmentId: form.scope === 'department' ? form.departmentId : null,
        channelId: form.scope === 'channel' ? form.channelId : null,
        section: form.scope === 'department' ? form.section : null,
        assigneeId: form.assigneeId,
        collaboratorIds: form.collaboratorIds.filter((id) => id !== form.assigneeId),
        startDate: fromInputDate(form.startDate),
        dueDate: fromInputDate(form.dueDate),
        priority: form.priority,
      },
      subtaskTitles
    )
  }

  // Người phối hợp không gồm người phụ trách
  const collaboratorOptions = state.users.filter((u) => u.id !== form.assigneeId)

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && closeCreateModal()}>
      <div className="modal">
        <div className="modal-head">
          <h2>Tạo công việc mới</h2>
          <button className="btn btn-ghost" onClick={closeCreateModal}><X size={18} /></button>
        </div>

        <div className="modal-body">
          <label className="form-field">
            <span>Tên công việc *</span>
            <input
              autoFocus
              placeholder="VD: Lập báo cáo tài chính quý III"
              value={form.title}
              onChange={(e) => { set({ title: e.target.value }); setError('') }}
            />
            {error && <span className="form-error">{error}</span>}
          </label>

          <label className="form-field">
            <span>Mô tả</span>
            <textarea
              rows={3}
              placeholder="Mô tả chi tiết công việc…"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </label>

          <div className="form-field">
            <span>Loại công việc</span>
            <div className="scope-options">
              {Object.entries(SCOPES).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`scope-option ${form.scope === key ? 'active' : ''}`}
                  onClick={() => set({ scope: key })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {form.scope === 'department' && (
            <div className="form-row">
              <label className="form-field">
                <span>Phòng ban</span>
                <select
                  value={form.departmentId}
                  onChange={(e) => set({ departmentId: e.target.value })}
                >
                  {state.departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Section</span>
                <select value={form.section} onChange={(e) => set({ section: e.target.value })}>
                  {SECTION_ORDER.map((s) => (
                    <option key={s} value={s}>{SECTIONS[s]}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {form.scope === 'channel' && (
            <label className="form-field">
              <span>Channel / Dự án</span>
              <select value={form.channelId} onChange={(e) => set({ channelId: e.target.value })}>
                {state.channels.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}

          <div className="form-row">
            <label className="form-field">
              <span>Người phụ trách</span>
              <select
                value={form.assigneeId}
                onChange={(e) => set({ assigneeId: e.target.value })}
              >
                {state.users.map((u) => (
                  <option key={u.id} value={u.id}>{u.displayName}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Ưu tiên</span>
              <select value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>{PRIORITY[p].label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-field">
            <span>Người phối hợp</span>
            <div className="collab-chips">
              {collaboratorOptions.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`collab-chip ${form.collaboratorIds.includes(u.id) ? 'active' : ''}`}
                  onClick={() => toggleCollaborator(u.id)}
                >
                  <Avatar user={u} size={18} /> {u.displayName}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label className="form-field">
              <span>Ngày bắt đầu</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set({ startDate: e.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Deadline</span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => set({ dueDate: e.target.value })}
              />
            </label>
          </div>

          <div className="form-field">
            <span>Việc con</span>
            {subtaskTitles.length > 0 && (
              <ul className="modal-subtasks">
                {subtaskTitles.map((t, i) => (
                  <li key={i}>
                    <span>{t}</span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setSubtaskTitles((list) => list.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="subtask-add">
              <Plus size={15} />
              <input
                placeholder="Thêm việc con rồi nhấn Enter…"
                value={subtaskInput}
                onChange={(e) => setSubtaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addSubtaskTitle() }
                }}
              />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={closeCreateModal}>Hủy</button>
          <button className="btn btn-primary" onClick={submit}>Tạo công việc</button>
        </div>
      </div>
    </div>
  )
}
