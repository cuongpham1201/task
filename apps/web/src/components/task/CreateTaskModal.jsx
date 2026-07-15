import { useState } from 'react'
import { X, Plus, Trash2, Target } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'
import SearchUser from '../shared/SearchUser'
import { PRIORITY, PRIORITY_ORDER } from '../../data/constants'
import { fromInputDate } from '../../utils/date'
import { orgUnitLabel } from '../../utils/org'

export default function CreateTaskModal() {
  const {
    state, currentUser, closeCreateModal, createTask, visibleDepartments, visibleChannels,
    actionsForOrg, kpiDefinitions,
  } = useApp()
  const defaults = state.createModal?.defaults || {}
  // Tạo từ Action → khóa Đơn vị yêu cầu + Action, không bắt nhập lại (PHẦN 5)
  const fromAction = !!defaults.actionId
  const fromActionInfo = fromAction
    ? { dept: visibleDepartments.find((d) => d.id === defaults.departmentId), action: (actionsForOrg(defaults.departmentId) || []).find((a) => a.id === defaults.actionId) }
    : null

  // Phòng ban chọn được = các phòng user đang thấy (server đã scope theo quyền).
  const deptOptions = visibleDepartments
  const channelOptions = visibleChannels

  // P0-1 (Task 3 chiều): Đơn vị chịu trách nhiệm + Dự án + Action là 3 lựa chọn ĐỘC LẬP,
  // không loại trừ nhau. Không ép chọn Dự án/Action; đơn vị mặc định = phòng của tôi.
  const [form, setForm] = useState(() => {
    return {
      title: '',
      description: '',
      departmentId:
        deptOptions.some((d) => d.id === defaults.departmentId)
          ? defaults.departmentId
          : (deptOptions.find((d) => d.id === currentUser.orgUnitId)?.id || deptOptions[0]?.id || null),
      channelId: channelOptions.some((c) => c.id === defaults.channelId) ? defaults.channelId : '',
      sectionId: defaults.sectionId || '',
      assigneeId: currentUser.id,
      collaboratorIds: [],
      startDate: '',
      dueDate: '',
      priority: 'normal',
      completionMode: 'self', // 'review_required' = phải nộp nghiệm thu mới đóng được
      reviewerId: '', // P0-2: bắt buộc khi cần nghiệm thu
      expectedOutput: '',
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

  // Đơn vị chịu trách nhiệm quyết định danh sách Action gắn được (Action cùng đơn vị)
  const responsibleOrg = form.departmentId
    || state.users.find((u) => u.id === form.assigneeId)?.orgUnitId
    || currentUser.orgUnitId
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
    const reviewRequired = form.isScorable || form.completionMode === 'review_required'
    if (reviewRequired && !form.reviewerId) {
      setError('Công việc cần nghiệm thu phải chọn người nghiệm thu')
      return
    }
    createTask(
      {
        title: form.title.trim(),
        description: form.description.trim(),
        expectedOutput: form.expectedOutput.trim(),
        // 3 chiều độc lập: đơn vị luôn có; dự án tùy chọn (scope chỉ còn là nhãn tương thích)
        scope: form.channelId ? 'channel' : (form.departmentId ? 'department' : 'personal'),
        personal: !form.departmentId && !form.channelId, // A: cá nhân riêng tư → không gắn phòng/dự án
        departmentId: form.departmentId || null,
        orgUnitId: form.departmentId || undefined,
        channelId: form.channelId || null,
        projectId: form.channelId || undefined,
        sectionId: form.sectionId || null,
        assigneeId: form.assigneeId,
        collaboratorIds: form.collaboratorIds.filter((id) => id !== form.assigneeId),
        startDate: fromInputDate(form.startDate),
        dueDate: fromInputDate(form.dueDate),
        priority: form.priority,
        completionMode: form.completionMode,
        actionId: form.actionId || null,
        reviewerId: reviewRequired ? form.reviewerId : null,
        reviewRequired,
        ...(fromAction && defaults.projectId ? { projectId: defaults.projectId, channelId: defaults.projectId } : {}),
        isScorable: form.isScorable,
        kpiDefinitionId: form.isScorable ? form.kpiDefinitionId : null,
        kpiWeight: form.isScorable ? Number(form.kpiWeight) : null,
      },
      subtaskTitles
    )
  }

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

          <label className="form-field">
            <span>Kết quả cần đạt</span>
            <textarea
              rows={2}
              placeholder="VD: Nộp báo cáo đối chiếu công nợ, có xác nhận của NPP"
              value={form.expectedOutput}
              onChange={(e) => set({ expectedOutput: e.target.value })}
            />
          </label>

          {fromAction && (
            <div className="fromaction-banner">
              <Target size={15} />
              <span>Thuộc Action: <strong>{fromActionInfo?.action?.title || 'Action'}</strong> · Đơn vị yêu cầu: <strong>{fromActionInfo?.dept?.name || '—'}</strong></span>
            </div>
          )}

          {/* P0-1: 3 chiều ĐỘC LẬP — đơn vị chịu trách nhiệm luôn có; Dự án/Action tùy chọn */}
          {!fromAction && (
            <div className="form-row">
              <label className="form-field">
                <span>Đơn vị chịu trách nhiệm</span>
                <select
                  value={form.departmentId || ''}
                  onChange={(e) => set({ departmentId: e.target.value || null, actionId: '', ...(e.target.value ? {} : { channelId: '' }) })}
                >
                  <option value="">— Cá nhân (riêng tư — chỉ bạn &amp; người được giao) —</option>
                  {deptOptions.map((d) => (
                    <option key={d.id} value={d.id}>{orgUnitLabel(d)}</option>
                  ))}
                </select>
              </label>
              {form.departmentId && (
                <label className="form-field">
                  <span>Dự án (tùy chọn)</span>
                  <select value={form.channelId || ''} onChange={(e) => set({ channelId: e.target.value })}>
                    <option value="">— Không thuộc dự án —</option>
                    {channelOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          {!fromAction && !form.departmentId && (
            <p className="muted" style={{ fontSize: 12, margin: '-4px 0 0' }}>
              Việc cá nhân riêng tư: chỉ bạn và người được giao (cùng người phối hợp/theo dõi được mời) nhìn thấy — không hiện cho phòng ban, không vào báo cáo đơn vị.
            </p>
          )}
          {state.sections.length > 0 && (
            <label className="form-field">
              <span>Section</span>
              <select value={form.sectionId} onChange={(e) => set({ sectionId: e.target.value })}>
                <option value="">— Không —</option>
                {state.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}

          <div className="form-row">
            <div className="form-field">
              <span>Người thực hiện</span>
              <SearchUser value={form.assigneeId} onSelect={(id) => set({ assigneeId: id || currentUser.id })} placeholder="Tìm người thực hiện…" />
            </div>
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
              {form.collaboratorIds.map((id) => {
                const u = state.users.find((x) => x.id === id)
                return u && (
                  <button key={id} type="button" className="collab-chip active" onClick={() => toggleCollaborator(id)}>
                    <Avatar user={u} size={18} /> {u.displayName} <X size={12} />
                  </button>
                )
              })}
            </div>
            <SearchUser
              value={null}
              onSelect={(id) => { if (id && id !== form.assigneeId && !form.collaboratorIds.includes(id)) set({ collaboratorIds: [...form.collaboratorIds, id] }) }}
              placeholder="Thêm người phối hợp…"
            />
          </div>

          {!fromAction && actionOptions.length > 0 && (
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
              <small>Người nhận phải "Nộp nghiệm thu"; NGƯỜI NGHIỆM THU duyệt Đạt/Trả lại trước khi đóng việc.</small>
            </span>
          </label>

          {(form.isScorable || form.completionMode === 'review_required') && (
            <div className="form-field">
              <span>Người nghiệm thu *</span>
              <SearchUser value={form.reviewerId || null} onSelect={(id) => { set({ reviewerId: id || '' }); setError('') }} placeholder="Tìm người nghiệm thu…" />
            </div>
          )}

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
