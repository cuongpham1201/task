import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Target, Plus, ChevronRight, Building2, Printer } from 'lucide-react'
import { useApp } from '../store/AppContext'
import EmptyState from '../components/shared/EmptyState'
import { ACTION_STATUS } from '../data/constants'
import { deptColor } from '../utils/color'
import { formatDate, isOverdue } from '../utils/date'
import { useLocalStorage } from '../utils/useLocalStorage'
import { orgUnitDisplayName } from '../utils/org'

function ActionStatusBadge({ status }) {
  const s = ACTION_STATUS[status] || { label: status, tone: 'gray' }
  return <span className={`badge tone-${s.tone}`}>{s.label}</span>
}

// Danh sách 6 tháng gần nhất cho bộ lọc kỳ
function recentPeriods() {
  const out = []
  const d = new Date()
  for (let i = 0; i < 6; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export default function ActionLog() {
  const { state, fetchActionLog, canManageActions, openCreateActionModal, usersById, channelsById } = useApp()
  const navigate = useNavigate()
  const periods = useMemo(recentPeriods, [])
  const [period, setPeriod] = useLocalStorage('actionlog.period', '') // '' = tất cả kỳ
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetchActionLog(period ? { period } : {})
      .then((d) => setData(d))
      .catch(() => setData({ blocks: [], total: 0 }))
      .finally(() => setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [period])

  // BUG2: refetch khi actions/tasks đổi (tạo/sửa/lưu trữ action, tạo task thuộc action)
  // → list + badge task luôn khớp, không cần F5. fetchActionLog không dispatch → không loop.
  useEffect(() => {
    if (!loading && data) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.actions, state.tasks])

  const openAction = (id) => navigate(`/actions/${id}`)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1><Target size={20} /> Action Log</h1>
          <p className="page-sub">Cam kết/mục tiêu quản lý theo đơn vị — cập nhật theo họp tác nghiệp.</p>
        </div>
        <div className="page-head-actions">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="">Tất cả kỳ</option>
            {periods.map((p) => <option key={p} value={p}>Tháng {p.slice(5)}/{p.slice(0, 4)}</option>)}
          </select>
          <button className="btn no-print" onClick={() => window.print()} title="In / Xuất bản họp">
            <Printer size={15} /> In
          </button>
          {canManageActions && (
            <button className="btn btn-primary no-print" onClick={() => openCreateActionModal()}>
              <Plus size={15} /> Tạo Action
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card"><p className="muted" style={{ padding: 8 }}>Đang tải…</p></div>
      ) : !data || data.total === 0 ? (
        <EmptyState icon={Target} title="Chưa có Action nào" hint="Tạo Action để ghi nhận cam kết/mục tiêu của đơn vị." />
      ) : (
        data.blocks.map((b) => (
          <div className="card actlog-block" key={b.id}>
            <div className="card-head"><h2><Building2 size={15} /> {b.name}</h2></div>
            {b.departments.map((d) => (
              <div className="actlog-dept" key={d.id}>
                <div className="actlog-dept-head">
                  <span className="side-dot" style={{ background: deptColor(d.code) }} /> {orgUnitDisplayName(d, state.departments)}
                  <span className="actlog-dept-count">{d.actions.length}</span>
                </div>
                <div className="actlog-list">
                  {d.actions.map((a) => {
                    const over = a.deadline && a.status !== 'done' && a.status !== 'cancelled' && isOverdue({ dueDate: a.deadline, status: a.status })
                    return (
                      <button key={a.id} className="actlog-row" onClick={() => openAction(a.id)}>
                        <span className="actlog-main">
                          <span className="actlog-title">
                            {a.title}
                            {a.projectId && channelsById[a.projectId] && <span className="chip chip-project"># {channelsById[a.projectId].name}</span>}
                          </span>
                          {a.latestUpdate && <span className="actlog-latest muted">“{a.latestUpdate.content}”</span>}
                        </span>
                        <span className="actlog-meta">
                          <ActionStatusBadge status={a.status} />
                          <span className="actlog-taskbadges">
                            <span className="muted" title="Đang mở">{a.taskOpen ?? 0} mở</span>
                            {a.taskOverdue > 0 && <span className="badge tone-red" title="Quá hạn">{a.taskOverdue} trễ</span>}
                            {a.taskReview > 0 && <span className="badge tone-amber" title="Chờ nghiệm thu">{a.taskReview} NT</span>}
                          </span>
                          <span className="muted">{a.ownerName || usersById[a.ownerId]?.displayName || '—'}</span>
                          {a.deadline && <span className={over ? 'text-overdue' : 'muted'}>{formatDate(a.deadline)}</span>}
                          <span className="progress-track" style={{ width: 48 }}>
                            <span className={`progress-fill ${a.progress >= 100 ? 'complete' : ''}`} style={{ width: `${a.progress}%` }} />
                          </span>
                          <ChevronRight size={15} className="muted" />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
