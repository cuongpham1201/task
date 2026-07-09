import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { List, Kanban, CalendarDays, Plus } from 'lucide-react'
import { useApp } from '../store/AppContext'
import TaskTable from '../components/task/TaskTable'
import QuickAddTask from '../components/task/QuickAddTask'
import KanbanBoard from '../components/task/KanbanBoard'
import CalendarView from '../components/task/CalendarView'
import { AvatarGroup } from '../components/shared/Avatar'
import Breadcrumb from '../components/shared/Breadcrumb'
import { isOverdue } from '../utils/date'
import { deptColor } from '../utils/color'

const VIEWS = [
  { key: 'list', label: 'Danh sách', icon: List },
  { key: 'board', label: 'Bảng', icon: Kanban },
  { key: 'calendar', label: 'Lịch', icon: CalendarDays },
]

export default function DepartmentPage() {
  const { id } = useParams()
  const { state, usersById, perms, departmentTasks, openCreateModal, orgUnitsById } = useApp()
  const [view, setView] = useState('list')

  const dept = state.departments.find((d) => d.id === id)
  if (!dept) return <div className="page"><p>Không tìm thấy phòng ban.</p></div>
  const block = dept.blockId ? orgUnitsById[dept.blockId] : null

  const tasks = departmentTasks(dept.id)
  const members = state.users.filter((u) => u.orgUnitId === dept.id)
  const managerName = dept.managerName
  const openCount = tasks.filter((t) => t.status !== 'done').length
  const overdueCount = tasks.filter(isOverdue).length
  const reviewCount = tasks.filter((t) => t.status === 'submitted').length
  const nowM = new Date().getMonth(); const nowY = new Date().getFullYear()
  const doneThisMonth = tasks.filter((t) => t.status === 'done' && t.completedAt && new Date(t.completedAt).getMonth() === nowM && new Date(t.completedAt).getFullYear() === nowY).length
  const actionOpen = (state.actions || []).filter((a) => a.orgUnitId === dept.id && !a.archived && a.status !== 'done' && a.status !== 'cancelled').length

  return (
    <div className="page">
      <Breadcrumb items={[block && { label: block.name }, { label: dept.name }]} />
      <div className="page-head">
        <div>
          <h1>
            <span className="side-dot big" style={{ background: deptColor(dept.code) }} /> {dept.name}
          </h1>
          <p className="page-sub">
            Trưởng phòng: <strong>{managerName || '—'}</strong>
            {' · '}{openCount} việc đang mở
            {overdueCount > 0 && <span className="text-overdue"> · {overdueCount} việc quá hạn</span>}
          </p>
        </div>
        <div className="page-head-actions">
          <AvatarGroup users={members} />
          {perms.createDeptTask(dept.id) && (
            <button
              className="btn btn-primary"
              onClick={() => openCreateModal({ scope: 'department', departmentId: dept.id })}
            >
              <Plus size={15} /> Tạo công việc
            </button>
          )}
        </div>
      </div>

      <div className="card dept-mini">
        <div className="action-mini-stats" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          <span className="ams"><b>{actionOpen}</b> Action mở</span>
          <span className="ams"><b>{openCount}</b> việc mở</span>
          <span className="ams t-red"><b>{overdueCount}</b> quá hạn</span>
          <span className="ams t-amber"><b>{reviewCount}</b> chờ nghiệm thu</span>
          <span className="ams t-green"><b>{doneThisMonth}</b> hoàn thành tháng này</span>
        </div>
      </div>

      <div className="tabs">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            className={`tab ${view === v.key ? 'active' : ''}`}
            onClick={() => setView(v.key)}
          >
            <v.icon size={15} /> {v.label}
          </button>
        ))}
      </div>

      {view === 'list' && perms.createDeptTask(dept.id) && (
        <QuickAddTask scope="department" departmentId={dept.id} placeholder="Thêm nhanh việc cho phòng… (Enter)" />
      )}
      {view === 'list' && (
        <TaskTable
          tasks={tasks}
          showContext={false}
          groupBySection
          emptyText="Phòng ban chưa có công việc nào"
        />
      )}
      {view === 'board' && <KanbanBoard tasks={tasks} />}
      {view === 'calendar' && <CalendarView tasks={tasks} />}
    </div>
  )
}
