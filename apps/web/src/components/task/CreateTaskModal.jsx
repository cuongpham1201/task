import { useEffect, useMemo, useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'
import { PRIORITY, PRIORITY_ORDER, SECTIONS, SECTION_ORDER, SCOPES } from '../../data/constants'
import { fromInputDate } from '../../utils/date'

export default function CreateTaskModal() {
  const {
    state, currentUser, closeCreateModal, createTask, visibleDepartments, visibleChannels,
    actionsForOrg, kpiDefinitions,
  } = useApp()
  const defaults = state.createModal?.defaults || {}

  // Phòng ban chọn được = các phòng user đang thấy (server đã scope theo quyền).
  const deptOptions = visibleDepartments
  const canDeptScope = deptOptions.length > 0
  const channelOptions = visibleChannels

  const scopeAllowed = (s) =>
    s === 'personal' ||
    (s === 'department' ? canDeptScope && deptOptions.length > 0 : channelOptions.length > 0)

  const [form, setForm] = useState(() => {
    const scope = defaults.scope && scopeAllowed(defaults.scope)
      ? defaults.scope
      : (canDeptScope ? 'department' : 'personal')
    return {
      title: '',
      description: '',
      scope,
      departmentId:
        deptOptions.some((d) => d.id === defaults.departmentId)
          ? defaults.departmentId
          : (deptOptions.find((d) => d.id === currentUser.orgUnitId)?.id || deptOptions[0]?.id || null),
      channelId:
        channelOptions.some((c) => c.id === defaults.channelId)
          ? defaults.channelId
          : (channelOptions[0]?.id || null),
      section: defaults.section || 'suvu',
      assigneeId: currentUser.id,
      collaboratorIds: [],
      startDate: '',
      dueDate: '',
      priority: 'normal',
      completionMode: 'self', // 'review_required' = phải nộp nghiệm thu mới đóng được
      actionId: defaults.actionId || '',
      isScorable: false,
      kpiDefinitionId: '',
      kpiWeight: '',
    }
  })
  const [subtaskTitles, setSubtaskTitles] = useState([])
  const [subtaskInput, setSubtaskInput] = useState('')
  const [error, setError] = useState('')

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  // Người thực hiện giới hạn theo phạm vi đã chọn
  const assigneePool = useMemo(() => {
    if (form.scope === 'department') {
      return state.users.filter((u) => u.orgUnitId === form.departmentId)
    }
    if (form.scope === 'channel') {
      const channel = state.channels.find((c) => c.id === form.channelId)
      return (channel?.members || []).map((id) => state.users.find((u) => u.id === id)).filter(Boolean)
    }
    return [currentUser] // personal: tự phụ trách
  }, [form.scope, form.departmentId, form.channelId, state.users, state.channels, currentUser])

  // Đổi phạm vi → đảm bảo assignee còn nằm trong pool
  useEffect(() => {
    if (!assigneePool.some((u) => u.id === form.assigneeId)) {
      set({ assigneeId: assigneePool[0]?.id || currentUser.id })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assigneePool])

  // Org chịu trách nhiệm để lọc Action: phòng (nếu scope=department) hoặc org của người thực hiện
  const responsibleOrg = form.scope === 'department'
    ? form.departmentId
    : (state.users.find((u) => u.id === form.assigneeId)?.orgUnitId || currentUser.orgUnitId)
  const actionOptions = responsibleOrg ? actionsForOrg(responsibleOrg) : []
  const hasKpiDefs = kpiDefinitions.length > 0

  if (!state.createModal) return null

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
    if (form.isScorable) {
      if (!hasKpiDefs) { setError('Chưa có KPI definition — không tạo được task tính KPI'); return }
      if (!form.kpiDefinitionId) { setError('Chọn KPI definition'); return }
      if (form.kpiWeight === '' || Number.isNaN(Number(form.kpiWeight))) { setError('Nhập trọng số KPI'); return }
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
        completionMode: form.completionMode,
        actionId: form.actionId || null,
        isScorable: form.isScorable,
        kpiDefinitionId: form.isScorable ? form.kpiDefinitionId : null,
        kpiWeight: form.isScorable ? Number(form.kpiWeight) : null,
      },
      subtaskTitles
    )
  }

  // Người phối hợp: cùng pool với người phụ trách (personal: mời ai cũng được)
  const collaboratorOptions = (form.scope === 'personal' ? state.users : assigneePool)
    .filter((u) => u.id !== form.assigneeId)

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
              {Object.entries(SCOPES)
                .filter(([key]) => scopeAllowed(key))
                .map(([key, label]) => (
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
                  value={form.departmentId || ''}
                  disabled={deptOptions.length <= 1}
                  onChange={(e) => set({ departmentId: e.target.value })}
                >
                  {deptOptions.map((d) => (
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
              <span>Dự án</span>
              <select value={form.channelId || ''} onChange={(e) => set({ channelId: e.target.value })}>
                {channelOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}

          <div className="form-row">
            <label className="form-field">
              <span>Người thực hiện</span>
              <select
                value={form.assigneeId}
                disabled={form.scope === 'personal'}
                onChange={(e) => set({ assigneeId: e.target.value })}
              >
                {assigneePool.map((u) => (
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
              {collaboratorOptions.length === 0 && (
                <span className="muted">Không có người phù hợp</span>
              )}
            </div>
          </div>

          {actionOptions.length > 0 && (
            <label className="form-field">
              <span>Action (tùy chọn)</span>
              <select value={form.actionId} onChange={(e) => set({ actionId: e.target.value })}>
                <option value="">— Không thuộc Action —</option>
                {actionOptions.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </label>
          )}

          <label className="review-toggle">
            <input
              type="checkbox"
              checked={form.isScorable || form.completionMode === 'review_required'}
              disabled={form.isScorable}
              onChange={(e) =>
                set({ completionMode: e.target.checked ? 'review_required' : 'self' })
              }
            />
            <span>
              <strong>Cần nghiệm thu khi hoàn thành</strong>
              <small>Người nhận phải "Nộp nghiệm thu"; người giao duyệt Đạt/Trả lại trước khi đóng việc.</small>
            </span>
          </label>

          <label className="review-toggle">
            <input
              type="checkbox"
              checked={form.isScorable}
              onChange={(e) => set({ isScorable: e.target.checked, ...(e.target.checked ? { completionMode: 'review_required' } : {}) })}
            />
            <span>
              <strong>Tính KPI (sinh evidence cho HRM)</strong>
              <small>Bật KPI sẽ bắt buộc nghiệm thu, chọn KPI definition và trọng số. App không tính điểm — HRM tính.</small>
            </span>
          </label>

          {form.isScorable && (
            hasKpiDefs ? (
              <div className="form-row">
                <label className="form-field">
                  <span>KPI definition *</span>
                  <select value={form.kpiDefinitionId} onChange={(e) => { set({ kpiDefinitionId: e.target.value }); setError('') }}>
                    <option value="">— Chọn —</option>
                    {kpiDefinitions.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                </label>
                <label className="form-field">
                  <span>Trọng số *</span>
                  <input type="number" min="0" step="0.5" placeholder="VD: 2" value={form.kpiWeight}
                    onChange={(e) => { set({ kpiWeight: e.target.value }); setError('') }} />
                </label>
              </div>
            ) : (
              <p className="form-error">Chưa có KPI definition (sẽ được nạp từ HRM ở phase sau). Tạm thời chưa tạo được task tính KPI.</p>
            )
          )}

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
