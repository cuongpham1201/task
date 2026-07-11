import { useMemo, useState } from 'react'
import { ClipboardList, CheckCircle2, AlertTriangle, Percent } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { deptColor } from '../utils/color'
import TaskTable from '../components/task/TaskTable'
import { isOverdue, diffDays } from '../utils/date'
import { orgUnitLabel, orgUnitShortLabel } from '../utils/org'

function inTimeRange(task, range) {
  if (range === 'all' || !task.dueDate) return range === 'all'
  const d = diffDays(new Date(), task.dueDate)
  if (range === 'week') return d >= -7 && d <= 7
  if (range === 'month') return d >= -31 && d <= 31
  return true
}

export default function Reports() {
  const { state, currentUser, usersById, permissions, visibleDepartments } = useApp()
  // FEATURE-003: gate theo permission backend (org_unit_roles) — không dùng users.role='manager'
  const isAdmin = !!permissions.isAdmin
  const hasOrgScope = !isAdmin && !!permissions.canViewReports

  // Phân quyền: admin/người có vai trò tổ chức xem theo phạm vi (task server đã scope),
  // nhân viên thường xem việc của mình
  const [deptFilter, setDeptFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('all')
  const [timeFilter, setTimeFilter] = useState('all')

  const scoped = useMemo(() => {
    let list = state.tasks
    if (!isAdmin && !hasOrgScope) {
      list = list.filter((t) => t.assigneeId === currentUser.id)
    } else if (deptFilter !== 'all') {
      list = list.filter((t) =>
        t.departmentId === deptFilter ||
        usersById[t.assigneeId]?.orgUnitId === deptFilter
      )
    }
    if (userFilter !== 'all') list = list.filter((t) => t.assigneeId === userFilter)
    if (timeFilter !== 'all') list = list.filter((t) => inTimeRange(t, timeFilter))
    return list
  }, [state.tasks, deptFilter, userFilter, timeFilter, isAdmin, hasOrgScope, currentUser, usersById])

  const stats = useMemo(() => {
    const done = scoped.filter((t) => t.status === 'done').length
    return {
      total: scoped.length,
      done,
      overdue: scoped.filter(isOverdue).length,
      rate: scoped.length ? Math.round((done / scoped.length) * 100) : 0,
    }
  }, [scoped])

  // Tỷ lệ hoàn thành theo phòng ban (admin + người có phạm vi tổ chức; departments đã scope server)
  const deptStats = useMemo(() => {
    if (!isAdmin && !hasOrgScope) return []
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
  }, [isAdmin, hasOrgScope, state.departments, state.tasks])

  const overdueTasks = scoped
    .filter(isOverdue)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))

  // FEATURE-004: thẻ thống kê = bộ lọc cho bảng chi tiết bên dưới
  const [bucket, setBucket] = useState('overdue')
  const bucketTasks = bucket === 'all' ? scoped
    : bucket === 'done' ? scoped.filter((t) => t.status === 'done')
    : overdueTasks
  const BUCKET_TITLE = {
    all: `Tất cả task trong phạm vi (${scoped.length})`,
    done: `Task hoàn thành (${stats.done})`,
    overdue: `Danh sách task quá hạn (${overdueTasks.length})`,
  }

  const userOptions = deptFilter === 'all'
    ? state.users
    : state.users.filter((u) => u.orgUnitId === deptFilter)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Thống kê</h1>
          <p className="page-sub">Thống kê hoàn thành công việc theo phòng ban.</p>
        </div>
      </div>

      <div className="filter-row">
        {(isAdmin || hasOrgScope) && (
          <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setUserFilter('all') }}>
            <option value="all">Phòng ban: Tất cả</option>
            {(isAdmin ? state.departments : visibleDepartments).map((d) => (
              <option key={d.id} value={d.id}>{orgUnitLabel(d)}</option>
            ))}
          </select>
        )}
        {(isAdmin || hasOrgScope) && (
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="all">Nhân sự: Tất cả</option>
            {userOptions.map((u) => (
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
        <button className={`stat-card tone-blue clickable ${bucket === 'all' ? 'active' : ''}`} onClick={() => setBucket('all')}>
          <span className="stat-icon"><ClipboardList size={18} /></span>
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Số task được giao</span>
        </button>
        <button className={`stat-card tone-green clickable ${bucket === 'done' ? 'active' : ''}`} onClick={() => setBucket('done')}>
          <span className="stat-icon"><CheckCircle2 size={18} /></span>
          <span className="stat-value">{stats.done}</span>
          <span className="stat-label">Task hoàn thành</span>
        </button>
        <button className={`stat-card tone-red clickable ${bucket === 'overdue' ? 'active' : ''}`} onClick={() => setBucket('overdue')}>
          <span className="stat-icon"><AlertTriangle size={18} /></span>
          <span className="stat-value">{stats.overdue}</span>
          <span className="stat-label">Task quá hạn</span>
        </button>
        <button className={`stat-card tone-purple clickable ${bucket === 'done' ? 'active' : ''}`} onClick={() => setBucket('done')}
          title="Tỷ lệ hoàn thành = task hoàn thành / tổng — bấm xem danh sách hoàn thành">
          <span className="stat-icon"><Percent size={18} /></span>
          <span className="stat-value">{stats.rate}%</span>
          <span className="stat-label">Tỷ lệ hoàn thành</span>
        </button>
      </div>

      {(isAdmin || hasOrgScope) && (
        <div className="card">
          <div className="card-head"><h2>Tỷ lệ hoàn thành theo phòng ban</h2></div>
          <div className="report-bars">
            {deptStats.map((d) => (
              <div key={d.id} className="report-bar-row">
                <span className="report-bar-name">
                  <span className="side-dot" style={{ background: deptColor(d.code) }} /> {orgUnitShortLabel(d)}
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
          <h2>{BUCKET_TITLE[bucket]}</h2>
        </div>
        <TaskTable tasks={bucketTasks} emptyText={bucket === 'overdue' ? 'Không có task nào quá hạn 🎉' : 'Không có task nào'} />
      </div>
    </div>
  )
}
