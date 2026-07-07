import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardList, CheckCircle2, AlertTriangle, MessageCircleQuestion, Hash,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { StatusBadge } from '../components/shared/badges'
import EmptyState from '../components/shared/EmptyState'
import {
  greetingByHour, todayLabel, isOverdue, isUpcoming, dueLabel,
} from '../utils/date'

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <span className="stat-icon"><Icon size={18} /></span>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

const MY_TABS = [
  { key: 'upcoming', label: 'Sắp đến hạn' },
  { key: 'overdue', label: 'Quá hạn' },
  { key: 'done', label: 'Đã hoàn thành' },
]

export default function Dashboard() {
  const {
    currentUser, myTasks, departmentTasks, channelTasks, selectTask,
    visibleDepartments, visibleChannels,
  } = useApp()
  const [tab, setTab] = useState('upcoming')

  const mine = myTasks()
  const stats = useMemo(() => ({
    total: mine.length,
    done: mine.filter((t) => t.status === 'done').length,
    overdue: mine.filter(isOverdue).length,
    waiting: mine.filter((t) => t.status === 'waiting').length,
  }), [mine])

  const tabTasks = useMemo(() => {
    if (tab === 'upcoming') {
      return mine
        .filter((t) => isUpcoming(t))
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    }
    if (tab === 'overdue') return mine.filter(isOverdue)
    return mine.filter((t) => t.status === 'done').slice(0, 6)
  }, [tab, mine])


  return (
    <div className="page">
      <div className="dash-greeting">
        <p className="dash-date">{todayLabel()}</p>
        <h1>{greetingByHour()}, {currentUser.displayName.split(' ').pop()}!</h1>
      </div>

      <div className="stat-grid">
        <StatCard icon={ClipboardList} label="Tổng việc được giao" value={stats.total} tone="blue" />
        <StatCard icon={CheckCircle2} label="Việc hoàn thành" value={stats.done} tone="green" />
        <StatCard icon={AlertTriangle} label="Việc quá hạn" value={stats.overdue} tone="red" />
        <StatCard icon={MessageCircleQuestion} label="Việc chờ phản hồi" value={stats.waiting} tone="amber" />
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-head">
            <h2>Việc của tôi</h2>
            <Link to="/my-tasks" className="card-link">Xem tất cả</Link>
          </div>
          <div className="mini-tabs">
            {MY_TABS.map((t) => (
              <button
                key={t.key}
                className={`tab ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="dash-task-list">
            {tabTasks.length === 0 && (
              <EmptyState title="Không có công việc nào" />
            )}
            {tabTasks.map((t) => {
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

        <div className="card">
          <div className="card-head"><h2>Phòng ban / Dự án</h2></div>
          <div className="dash-dept-list">
            {visibleDepartments.map((d) => {
              const ts = departmentTasks(d.id)
              const open = ts.filter((t) => t.status !== 'done').length
              const over = ts.filter(isOverdue).length
              return (
                <Link key={d.id} to={`/departments/${d.id}`} className="dash-dept">
                  <span className="side-dot" data-code={d.code} />
                  <span className="dash-dept-name">{d.name}</span>
                  <span className="dash-dept-stat">{open} đang mở</span>
                  <span className={`dash-dept-stat ${over > 0 ? 'overdue' : ''}`}>
                    {over} quá hạn
                  </span>
                </Link>
              )
            })}
            {visibleChannels.map((c) => {
              const ts = channelTasks(c.id)
              const open = ts.filter((t) => t.status !== 'done').length
              const over = ts.filter(isOverdue).length
              return (
                <Link key={c.id} to={`/channels/${c.id}`} className="dash-dept">
                  <Hash size={15} className="side-hash" />
                  <span className="dash-dept-name">{c.name}</span>
                  <span className="dash-dept-stat">{open} đang mở</span>
                  <span className={`dash-dept-stat ${over > 0 ? 'overdue' : ''}`}>
                    {over} quá hạn
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
