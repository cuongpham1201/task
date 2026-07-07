import { useMemo, useState } from 'react'
import { ClipboardList, CheckCircle2, AlertTriangle, Percent } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { deptColor } from '../utils/color'
import TaskTable from '../components/task/TaskTable'
import { isOverdue, diffDays } from '../utils/date'

function inTimeRange(task, range) {
  if (range === 'all' || !task.dueDate) return range === 'all'
  const d = diffDays(new Date(), task.dueDate)
  if (range === 'week') return d >= -7 && d <= 7
  if (range === 'month') return d >= -31 && d <= 31
  return true
}

export default function Reports() {
  const { state, currentUser, usersById } = useApp()
  const isAdmin = currentUser.role === 'admin'
  const isManager = currentUser.role === 'manager'

  // Phân quyền: admin xem tất cả, trưởng phòng xem phòng mình, nhân viên xem việc của mình
  const [deptFilter, setDeptFilter] = useState(isManager ? currentUser.orgUnitId : 'all')
  const [userFilter, setUserFilter] = useState('all')
  const [timeFilter, setTimeFilter] = useState('all')

  const scoped = useMemo(() => {
    let list = state.tasks
    if (!isAdmin && !isManager) {
      list = list.filter((t) => t.assigneeId === currentUser.id)
    } else if (isManager) {
      list = list.filter((t) =>
        t.departmentId === currentUser.orgUnitId ||
        usersById[t.assigneeId]?.orgUnitId === currentUser.orgUnitId
      )
    } else if (deptFilter !== 'all') {
      list = list.filter((t) =>
        t.departmentId === deptFilter ||
        usersById[t.assigneeId]?.orgUnitId === deptFilter
      )
    }
    if (userFilter !== 'all') list = list.filter((t) => t.assigneeId === userFilter)
    if (timeFilter !== 'all') list = list.filter((t) => inTimeRange(t, timeFilter))
    return list
  }, [state.tasks, deptFilter, userFilter, timeFilter, isAdmin, isManager, currentUser, usersById])

  const stats = useMemo(() => {
    const done = scoped.filter((t) => t.status === 'done').length
    return {
      total: scoped.length,
      done,
      overdue: scoped.filter(isOverdue).length,
      rate: scoped.length ? Math.round((done / scoped.length) * 100) : 0,
    }
  }, [scoped])

  // Tỷ lệ hoàn thành theo phòng ban (chỉ admin)
  const deptStats = useMemo(() => {
    if (!isAdmin) return []
    return state.departments.map((d) => {
      const ts = state.tasks.filter((t) => t.departmentId === d.id)
      const done = ts.filter((t) => t.status === 'done').length
      return {
        ...d,
        total: ts.length,
        done,
        overdue: ts.filter(isOverdue).length,
        rate: ts.length ? Math.round((done / ts.length) * 100) : 0,
      }
    })
  }, [isAdmin, state.departments, state.tasks])

  const overdueTasks = scoped
    .filter(isOverdue)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))

  const userOptions = deptFilter === 'all'
    ? state.users
    : state.users.filter((u) => u.orgUnitId === deptFilter)

  return (
    <div className="page">
      <div className="page-head">
        <h1>Báo cáo</h1>
      </div>

      <div className="filter-row">
        {isAdmin && (
          <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setUserFilter('all') }}>
            <option value="all">Phòng ban: Tất cả</option>
            {state.departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
        {(isAdmin || isManager) && (
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="all">Nhân sự: Tất cả</option>
            {(isManager
              ? state.users.filter((u) => u.orgUnitId === currentUser.orgUnitId)
              : userOptions
            ).map((u) => (
              <option key={u.id} value={u.id}>{u.displayName}</option>
            ))}
          </select>
        )}
        <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
          <option value="all">Thời gian: Tất cả</option>
          <option value="week">Hạn trong ±7 ngày</option>
          <option value="month">Hạn trong ±1 tháng</option>
        </select>
      </div>

      <div className="stat-grid">
        <div className="stat-card tone-blue">
          <span className="stat-icon"><ClipboardList size={18} /></span>
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Số task được giao</span>
        </div>
        <div className="stat-card tone-green">
          <span className="stat-icon"><CheckCircle2 size={18} /></span>
          <span className="stat-value">{stats.done}</span>
          <span className="stat-label">Task hoàn thành</span>
        </div>
        <div className="stat-card tone-red">
          <span className="stat-icon"><AlertTriangle size={18} /></span>
          <span className="stat-value">{stats.overdue}</span>
          <span className="stat-label">Task quá hạn</span>
        </div>
        <div className="stat-card tone-purple">
          <span className="stat-icon"><Percent size={18} /></span>
          <span className="stat-value">{stats.rate}%</span>
          <span className="stat-label">Tỷ lệ hoàn thành</span>
        </div>
      </div>

      {isAdmin && (
        <div className="card">
          <div className="card-head"><h2>Tỷ lệ hoàn thành theo phòng ban</h2></div>
          <div className="report-bars">
            {deptStats.map((d) => (
              <div key={d.id} className="report-bar-row">
                <span className="report-bar-name">
                  <span className="side-dot" style={{ background: deptColor(d.code) }} /> {d.name}
                </span>
                <span className="report-bar-track">
                  <span className="report-bar-fill" style={{ width: `${d.rate}%` }} />
                </span>
                <span className="report-bar-value">
                  {d.done}/{d.total} ({d.rate}%)
                  {d.overdue > 0 && <span className="text-overdue"> · {d.overdue} quá hạn</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>Danh sách task quá hạn ({overdueTasks.length})</h2>
        </div>
        <TaskTable tasks={overdueTasks} emptyText="Không có task nào quá hạn 🎉" />
      </div>
    </div>
  )
}
