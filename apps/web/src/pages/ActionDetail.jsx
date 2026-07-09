import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Target, ArrowLeft, Plus, ScrollText, ListTodo, Info, Archive,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import Avatar from '../components/shared/Avatar'
import Breadcrumb from '../components/shared/Breadcrumb'
import { StatusBadge } from '../components/shared/badges'
import {
  ACTION_STATUS, ACTION_STATUS_ORDER, ACTION_UPDATE_TYPE, ACTION_UPDATE_TYPE_ORDER,
} from '../data/constants'
import { formatDate, formatDateFull, timeAgo, isOverdue } from '../utils/date'
import { pushRecent } from '../utils/useLocalStorage'

export default function ActionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    fetchActionDetail, addActionUpdate, updateAction, archiveAction, canManageAction,
    usersById, departmentsById, channelsById, orgUnitsById, selectTask, openCreateModal,
  } = useApp()

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('log')
  const [form, setForm] = useState({ type: 'progress', content: '', statusTo: '', progressValue: '' })
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fetchActionDetail(id).then((d) => { setDetail(d); if (d) pushRecent({ type: 'action', id, title: d.title }) }).catch(() => setDetail(null)).finally(() => setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [id])

  const canManage = useMemo(() => (detail ? canManageAction(detail) : false), [detail, canManageAction])

  if (loading) return <div className="page"><div className="card"><p className="muted" style={{ padding: 8 }}>Đang tải…</p></div></div>
  if (!detail) return <div className="page"><p>Không tìm thấy Action hoặc bạn không có quyền xem.</p></div>

  const owner = usersById[detail.ownerId]
  const dept = departmentsById[detail.orgUnitId]
  const block = dept?.blockId ? orgUnitsById[dept.blockId] : null
  const project = detail.projectId ? channelsById[detail.projectId] : null
  const st = ACTION_STATUS[detail.status] || { label: detail.status, tone: 'gray' }
  const tasks = detail.tasks || []
  const taskStats = {
    open: tasks.filter((t) => t.status !== 'done' && t.status !== 'paused' && t.status !== 'cancelled').length,
    overdue: tasks.filter((t) => isOverdue(t)).length,
    review: tasks.filter((t) => t.status === 'submitted').length,
    done: tasks.filter((t) => t.status === 'done').length,
  }

  const submitUpdate = () => {
    if (!form.content.trim() || saving) return
    setSaving(true)
    const dto = { type: form.type, content: form.content.trim() }
    if (form.statusTo) dto.statusTo = form.statusTo
    if (form.progressValue !== '') dto.progressValue = Number(form.progressValue)
    addActionUpdate(id, dto)
      .then(() => { setForm({ type: 'progress', content: '', statusTo: '', progressValue: '' }); load() })
      .finally(() => setSaving(false))
  }

  return (
    <div className="page page-narrow">
      <Breadcrumb items={[
        { label: 'Action Log', to: '/action-log' },
        block && { label: block.name },
        dept && { label: dept.name, to: `/departments/${dept.id}` },
        { label: detail.title },
      ]} />

      <div className="card">
        <div className="page-head" style={{ marginBottom: 12 }}>
          <div>
            <h1><Target size={20} /> {detail.title}</h1>
            <p className="page-sub">{detail.description || 'Không có mô tả.'}</p>
          </div>
          {canManage && (
            <div className="page-head-actions">
              <select value={detail.status} onChange={(e) => updateAction(id, { status: e.target.value }, () => load())}>
                {ACTION_STATUS_ORDER.map((s) => <option key={s} value={s}>{ACTION_STATUS[s].label}</option>)}
              </select>
              <button className="btn btn-ghost" title="Lưu trữ" onClick={() => { if (window.confirm('Lưu trữ Action này?')) { archiveAction(id); navigate('/action-log') } }}>
                <Archive size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="action-header-grid">
          {block && <div><span className="detail-label">Khối</span><div>{block.name}</div></div>}
          <div><span className="detail-label">Đơn vị</span><div>{dept?.name || detail.orgUnitId}</div></div>
          <div><span className="detail-label">Owner</span><div className="cell-user">{owner ? <><Avatar user={owner} size={20} /> {owner.displayName}</> : '—'}</div></div>
          {project && <div><span className="detail-label">Dự án</span><div>{project.name}</div></div>}
          <div><span className="detail-label">Deadline</span><div>{detail.deadline ? formatDate(detail.deadline) : '—'}</div></div>
          <div><span className="detail-label">Trạng thái</span><div><span className={`badge tone-${st.tone}`}>{st.label}</span></div></div>
          <div><span className="detail-label">Tiến độ</span><div className="dash-dept-progress">
            <span className="progress-track" style={{ width: 60 }}><span className={`progress-fill ${detail.progress >= 100 ? 'complete' : ''}`} style={{ width: `${detail.progress}%` }} /></span>
            <span className="muted">{detail.progress}%</span>
          </div></div>
        </div>
        <div className="action-mini-stats">
          <span className="ams"><b>{taskStats.open}</b> đang mở</span>
          <span className="ams t-red"><b>{taskStats.overdue}</b> quá hạn</span>
          <span className="ams t-amber"><b>{taskStats.review}</b> chờ nghiệm thu</span>
          <span className="ams t-green"><b>{taskStats.done}</b> hoàn thành</span>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>
          <ScrollText size={15} /> Nhật ký điều hành <span className="tab-count">{detail.updates?.length || 0}</span>
        </button>
        <button className={`tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
          <ListTodo size={15} /> Task liên quan <span className="tab-count">{detail.tasks?.length || 0}</span>
        </button>
        <button className={`tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>
          <Info size={15} /> Thông tin
        </button>
      </div>

      {tab === 'log' && (
        <div className="card">
          {canManage && (
            <div className="action-update-form">
              <div className="form-row">
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  {ACTION_UPDATE_TYPE_ORDER.map((t) => <option key={t} value={t}>{ACTION_UPDATE_TYPE[t].label}</option>)}
                </select>
                <select value={form.statusTo} onChange={(e) => setForm((f) => ({ ...f, statusTo: e.target.value }))}>
                  <option value="">Giữ trạng thái</option>
                  {ACTION_STATUS_ORDER.map((s) => <option key={s} value={s}>→ {ACTION_STATUS[s].label}</option>)}
                </select>
                <input type="number" min="0" max="100" placeholder="% tiến độ" value={form.progressValue}
                  onChange={(e) => setForm((f) => ({ ...f, progressValue: e.target.value }))} style={{ width: 110 }} />
              </div>
              <textarea rows={2} placeholder="Nội dung cập nhật (nhật ký không sửa/xóa được)…"
                value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
              <div style={{ textAlign: 'right' }}>
                <button className="btn btn-primary" disabled={!form.content.trim() || saving} onClick={submitUpdate}>
                  <Plus size={15} /> Thêm cập nhật
                </button>
              </div>
            </div>
          )}
          {(!detail.updates || detail.updates.length === 0) && <p className="muted" style={{ padding: 8 }}>Chưa có cập nhật nào.</p>}
          <div className="action-update-list">
            {detail.updates?.map((u) => {
              const ut = ACTION_UPDATE_TYPE[u.type] || { label: u.type, tone: 'gray' }
              const author = usersById[u.authorId]
              return (
                <div key={u.id} className="action-update-item">
                  <span className={`badge tone-${ut.tone}`}>{ut.label}</span>
                  <div className="action-update-body">
                    <p>{u.content}</p>
                    <span className="muted">
                      <strong>{formatDate(u.createdAt)}</strong> · {author?.displayName || 'Người dùng'} · {timeAgo(u.createdAt)}
                      {u.statusTo && <> · chuyển {ACTION_STATUS[u.statusTo]?.label}</>}
                      {u.progressValue != null && <> · {u.progressValue}%</>}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'tasks' && (
        <div className="card">
          {canManage && (
            <div style={{ marginBottom: 10 }}>
              <button className="btn btn-primary" onClick={() => openCreateModal({ scope: 'department', departmentId: detail.orgUnitId, actionId: detail.id, projectId: detail.projectId })}>
                <Plus size={15} /> Tạo Task thuộc Action này
              </button>
            </div>
          )}
          {(!detail.tasks || detail.tasks.length === 0) && <p className="muted" style={{ padding: 8 }}>Chưa có task nào thuộc Action này.</p>}
          <div className="member-list">
            {detail.tasks?.map((t) => (
              <button key={t.id} className="member-row" style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border)' }} onClick={() => selectTask(t.id)}>
                <span className="cell-user" style={{ flex: 1 }}>{t.title}</span>
                <StatusBadge status={t.status} />
                <span className="muted">{usersById[t.assigneeId]?.displayName || '—'}</span>
                {t.dueDate && <span className="muted">{formatDate(t.dueDate)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'info' && (
        <div className="card">
          <div className="action-header-grid">
            <div><span className="detail-label">Kỳ (period)</span><div>{detail.period || '—'}</div></div>
            <div><span className="detail-label">Ưu tiên</span><div>{detail.priority}</div></div>
            <div><span className="detail-label">Cách tính tiến độ</span><div>{detail.progressMode === 'auto_from_tasks' ? 'Tự động từ Task' : 'Thủ công'}</div></div>
            <div><span className="detail-label">Người tạo</span><div>{usersById[detail.createdById]?.displayName || '—'}</div></div>
            <div><span className="detail-label">Tạo lúc</span><div>{formatDateFull(detail.createdAt)}</div></div>
          </div>
        </div>
      )}
    </div>
  )
}
