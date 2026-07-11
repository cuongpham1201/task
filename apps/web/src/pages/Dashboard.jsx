import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardList, CheckCircle2, AlertTriangle, ClipboardCheck, ChevronRight,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { getRecent } from '../utils/useLocalStorage'
import { deptColor } from '../utils/color'
import { StatusBadge } from '../components/shared/badges'
import {
  greetingByHour, todayLabel, isOverdue, isDueToday, isUpcoming, dueLabel,
} from '../utils/date'
import { orgUnitDisplayName } from '../utils/org'

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <span className="stat-icon"><Icon size={18} /></span>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function Bucket({ title, tasks, tone, selectTask }) {
  if (tasks.length === 0) return null
  return (
    <div className="dash-bucket">
      <div className="dash-bucket-head">
        <span className={`dash-bucket-title ${tone || ''}`}>{title}</span>
        <span className="dash-bucket-count">{tasks.length}</span>
      </div>
      <div className="dash-task-list">
        {tasks.map((t) => {
          const due = dueLabel(t)
          return (
            <button key={t.id} className="dash-task" onClick={() => selectTask(t.id)}>
              <span className="dash-task-title">{t.title}</span>
              <StatusBadge status={t.status} />
              <span className={`dash-task-due due-${due.tone}`}>{due.text}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { currentUser, myTasks, tasksIAssigned, perms, selectTask, visibleDepartments, state, canManageActions } = useApp()
  const me = currentUser?.id

  const mine = myTasks()
  const iAssignedOpen = tasksIAssigned().filter((t) => t.status !== 'done')
  const recent = getRecent()
  const buckets = useMemo(() => {
    // Phân hoạch TOÀN BỘ việc CHƯA XONG của tôi vào đúng một nhóm (không bỏ sót):
    const nonDone = mine.filter((t) => t.status !== 'done')
    const returned = nonDone.filter((t) => t.status === 'returned')
    const submittedMine = nonDone.filter((t) => t.status === 'submitted')
    const active = nonDone.filter((t) => t.status !== 'returned' && t.status !== 'submitted')
    const overdue = active.filter(isOverdue)
    const today = active.filter((t) => isDueToday(t) && !isOverdue(t))
    const week = active.filter((t) => isUpcoming(t, 7) && !isDueToday(t) && !isOverdue(t))
    // Catch-all: việc đang xử lý nhưng hạn xa (>7 ngày) hoặc CHƯA đặt hạn → vẫn phải hiện
    const later = active.filter((t) => !isOverdue(t) && !isDueToday(t) && !isUpcoming(t, 7))
    const toReview = state.tasks.filter(
      (t) => t.status === 'submitted' && (t.creatorId === me || perms.review(t))
    )
    const recentDone = mine
      .filter((t) => t.status === 'done')
      .sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt))
      .slice(0, 5)
    return { overdue, today, week, later, returned, submittedMine, toReview, recentDone, nonDoneCount: nonDone.length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, state.tasks, me])

  const stats = {
    total: buckets.nonDoneCount, // "Việc của tôi" = việc CHƯA XONG → khớp với widget
    done: mine.filter((t) => t.status === 'done').length,
    overdue: buckets.overdue.length,
    review: buckets.toReview.length,
  }

  // Quản lý: các task mình thấy nhưng KHÔNG phải việc cá nhân (qua quyền org/dự án)
  const managed = state.tasks.filter((t) => t.assigneeId !== me && t.creatorId !== me)
  const deptOverview = useMemo(() => {
    if (managed.length === 0) return []
    return visibleDepartments
      .map((d) => {
        const ts = state.tasks.filter((t) => t.departmentId === d.id)
        if (ts.length === 0) return null
        const open = ts.filter((t) => t.status !== 'done').length
        const over = ts.filter(isOverdue).length
        const submitted = ts.filter((t) => t.status === 'submitted').length
        const progress = Math.round(ts.reduce((s, t) => s + (t.progress || 0), 0) / ts.length)
        return { d, open, over, submitted, progress }
      })
      .filter(Boolean)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managed.length, visibleDepartments, state.tasks])

  // Action buckets (chỉ quản lý)
  const actionBuckets = useMemo(() => {
    if (!canManageActions) return null
    const live = (state.actions || []).filter((a) => !a.archived)
    const mine = live.filter((a) => a.ownerId === me)
    const atRisk = live.filter((a) => a.status === 'at_risk')
    const overdue = live.filter(
      (a) => a.deadline && a.status !== 'done' && a.status !== 'cancelled' && isOverdue({ dueDate: a.deadline, status: a.status })
    )
    return { mine, atRisk, overdue }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageActions, state.actions, me])

  const nothingPersonal =
    buckets.overdue.length + buckets.today.length + buckets.week.length + buckets.later.length +
    buckets.returned.length + buckets.submittedMine.length + buckets.toReview.length +
    iAssignedOpen.length + buckets.recentDone.length === 0

  return (
    <div className="page">
      <div className="dash-greeting">
        <p className="dash-date">{todayLabel()}</p>
        <h1>{greetingByHour()}, {currentUser?.displayName?.split(' ').pop()}!</h1>
      </div>

      <div className="stat-grid">
        <StatCard icon={ClipboardList} label="Việc của tôi" value={stats.total} tone="blue" />
        <StatCard icon={AlertTriangle} label="Quá hạn" value={stats.overdue} tone="red" />
        <StatCard icon={ClipboardCheck} label="Chờ tôi nghiệm thu" value={stats.review} tone="amber" />
        <StatCard icon={CheckCircle2} label="Đã hoàn thành" value={stats.done} tone="green" />
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-head">
            <h2>Việc của tôi</h2>
            <Link to="/my-tasks" className="card-link">Xem tất cả</Link>
          </div>
          {nothingPersonal ? (
            <p className="muted" style={{ padding: '8px 2px' }}>Không có việc cần xử lý. 🎉</p>
          ) : (
            <>
              <Bucket title="Quá hạn" tone="t-red" tasks={buckets.overdue} selectTask={selectTask} />
              <Bucket title="Hôm nay" tone="t-green" tasks={buckets.today} selectTask={selectTask} />
              <Bucket title="Tuần này" tasks={buckets.week} selectTask={selectTask} />
              <Bucket title="Sắp tới / chưa đặt hạn" tasks={buckets.later} selectTask={selectTask} />
              <Bucket title="Bị trả lại — chờ tôi xử lý" tone="t-red" tasks={buckets.returned} selectTask={selectTask} />
              <Bucket title="Đã nộp — chờ nghiệm thu" tone="t-amber" tasks={buckets.submittedMine} selectTask={selectTask} />
              <Bucket title="Chờ tôi nghiệm thu" tone="t-amber" tasks={buckets.toReview} selectTask={selectTask} />
              <Bucket title="Tôi giao — đang mở" tasks={iAssignedOpen} selectTask={selectTask} />
              <Bucket title="Hoàn thành gần đây" tasks={buckets.recentDone} selectTask={selectTask} />
            </>
          )}
        </div>

        {recent.length > 0 && (
          <div className="card">
            <div className="card-head"><h2>Gần đây</h2></div>
            <div className="dash-task-list">
              {recent.map((r) => (r.type === 'task' ? (
                <button key={`t${r.id}`} className="dash-task" onClick={() => selectTask(r.id)}>
                  <span className="dash-task-title">{r.title}</span><span className="muted">việc</span>
                </button>
              ) : (
                <Link key={`${r.type}${r.id}`} className="dash-task" to={r.type === 'action' ? `/actions/${r.id}` : `/channels/${r.id}`}>
                  <span className="dash-task-title">{r.title}</span><span className="muted">{r.type === 'action' ? 'action' : 'dự án'}</span>
                </Link>
              )))}
            </div>
          </div>
        )}

        {deptOverview.length > 0 && (
          <div className="card">
            <div className="card-head"><h2>Tổng quan quản lý</h2></div>
            <div className="dash-dept-list">
              {deptOverview.map(({ d, open, over, submitted, progress }) => (
                <Link key={d.id} to={`/departments/${d.id}`} className="dash-dept">
                  <span className="side-dot" style={{ background: deptColor(d.code) }} />
                  <span className="dash-dept-col">
                    <span className="dash-dept-name">{orgUnitDisplayName(d, visibleDepartments)}</span>
                    <span className="dash-dept-sub muted">
                      {open} đang mở
                      {submitted > 0 && <> · {submitted} chờ nghiệm thu</>}
                      {over > 0 && <span className="text-overdue"> · {over} quá hạn</span>}
                    </span>
                  </span>
                  <span className="dash-dept-progress">
                    <span className="progress-track" style={{ width: 54 }}>
                      <span className={`progress-fill ${progress >= 100 ? 'complete' : ''}`} style={{ width: `${progress}%` }} />
                    </span>
                    <span className="muted">{progress}%</span>
                  </span>
                  <ChevronRight size={16} className="muted" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {actionBuckets && (actionBuckets.mine.length + actionBuckets.atRisk.length + actionBuckets.overdue.length > 0) && (
          <div className="card">
            <div className="card-head">
              <h2>Action</h2>
              <Link to="/action-log" className="card-link">Xem Action Log</Link>
            </div>
            <ActionMini title="Rủi ro" tone="t-red" items={actionBuckets.atRisk} />
            <ActionMini title="Quá hạn" tone="t-red" items={actionBuckets.overdue} />
            <ActionMini title="Action của tôi" items={actionBuckets.mine} />
          </div>
        )}
      </div>
    </div>
  )
}

function ActionMini({ title, items, tone }) {
  if (!items || items.length === 0) return null
  return (
    <div className="dash-bucket">
      <div className="dash-bucket-head">
        <span className={`dash-bucket-title ${tone || ''}`}>{title}</span>
        <span className="dash-bucket-count">{items.length}</span>
      </div>
      <div className="dash-task-list">
        {items.slice(0, 5).map((a) => (
          <Link key={a.id} to={`/actions/${a.id}`} className="dash-task">
            <span className="dash-task-title">{a.title}</span>
            <span className="muted">{a.progress}%</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
