import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LayoutGrid, List, Kanban, Users, Activity, Plus, Hash, UserPlus, X, Pencil, Archive,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import TaskTable from '../components/task/TaskTable'
import KanbanBoard from '../components/task/KanbanBoard'
import Avatar, { AvatarGroup } from '../components/shared/Avatar'
import EmptyState from '../components/shared/EmptyState'
import Breadcrumb from '../components/shared/Breadcrumb'
import { STATUS, STATUS_ORDER } from '../data/constants'
import { activityText } from '../utils/activity'
import { timeAgo, isOverdue, isUpcoming } from '../utils/date'

const TABS = [
  { key: 'overview', label: 'Tổng quan', icon: LayoutGrid },
  { key: 'tasks', label: 'Công việc', icon: List },
  { key: 'members', label: 'Thành viên', icon: Users },
  { key: 'activity', label: 'Hoạt động', icon: Activity },
]

export default function ChannelPage() {
  const { id } = useParams()
  const {
    state, currentUser, usersById, perms, channelTasks, openCreateModal, getTask, selectTask,
    addProjectMember, removeProjectMember, updateProject, archiveProject,
  } = useApp()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [view, setView] = useState('list')
  const [statusFilter, setStatusFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [addUser, setAddUser] = useState('')

  const channel = state.channels.find((c) => c.id === id)
  const allTasks = channel ? channelTasks(channel.id) : []
  const filtered = useMemo(() => allTasks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (assigneeFilter !== 'all' && t.assigneeId !== assigneeFilter) return false
    return true
  }), [allTasks, statusFilter, assigneeFilter])

  const channelActivities = useMemo(() => {
    if (!channel) return []
    const ids = new Set(allTasks.map((t) => t.id))
    return state.activities.filter((a) => ids.has(a.taskId)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [channel, allTasks, state.activities])

  if (!channel) return <div className="page"><p>Không tìm thấy dự án.</p></div>

  const members = channel.members.map((uid) => usersById[uid]).filter(Boolean)
  const canManageMembers = currentUser.role === 'admin' || channel.ownerId === currentUser.id
  const nonMembers = state.users.filter((u) => !channel.members.includes(u.id))
  const stats = {
    total: allTasks.length,
    open: allTasks.filter((t) => t.status !== 'done').length,
    overdue: allTasks.filter(isOverdue).length,
    done: allTasks.filter((t) => t.status === 'done').length,
    soon: allTasks.filter((t) => isUpcoming(t, 7)).length,
  }

  return (
    <div className="page">
      <Breadcrumb items={[{ label: 'Dự án' }, { label: channel.name }]} />
      <div className="page-head">
        <div>
          <h1><Hash size={20} className="side-hash" /> {channel.name}</h1>
          <p className="page-sub">{channel.description}</p>
        </div>
        <div className="page-head-actions">
          {canManageMembers && (
            <>
              <button className="btn btn-ghost" title="Sửa dự án" onClick={() => {
                const name = window.prompt('Tên dự án:', channel.name)
                if (name === null) return
                const description = window.prompt('Mô tả:', channel.description || '')
                updateProject(channel.id, { name: name.trim() || channel.name, description: description ?? channel.description })
              }}><Pencil size={16} /></button>
              <button className="btn btn-ghost" title="Lưu trữ dự án" onClick={() => {
                if (window.confirm(`Lưu trữ dự án "${channel.name}"?`)) archiveProject(channel.id, () => navigate('/'))
              }}><Archive size={16} /></button>
            </>
          )}
          <AvatarGroup users={members} />
          {perms.createChannelTask(channel) && (
            <button className="btn btn-primary" onClick={() => openCreateModal({ scope: 'channel', channelId: channel.id })}>
              <Plus size={15} /> Tạo công việc
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <t.icon size={15} /> {t.label}
            {t.key === 'members' && <span className="tab-count">{members.length}</span>}
            {t.key === 'tasks' && <span className="tab-count">{stats.total}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="stat-grid">
          <div className="stat-card tone-blue"><span className="stat-value">{stats.open}</span><span className="stat-label">Đang mở</span></div>
          <div className="stat-card tone-amber"><span className="stat-value">{stats.soon}</span><span className="stat-label">Đến hạn 7 ngày</span></div>
          <div className="stat-card tone-red"><span className="stat-value">{stats.overdue}</span><span className="stat-label">Quá hạn</span></div>
          <div className="stat-card tone-green"><span className="stat-value">{stats.done}</span><span className="stat-label">Hoàn thành</span></div>
        </div>
      )}

      {tab === 'tasks' && (
        <>
          <div className="filter-row">
            <div className="view-toggle">
              <button className={`btn ${view === 'list' ? 'btn-primary' : ''}`} onClick={() => setView('list')}><List size={15} /></button>
              <button className={`btn ${view === 'board' ? 'btn-primary' : ''}`} onClick={() => setView('board')}><Kanban size={15} /></button>
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Trạng thái: Tất cả</option>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
            <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
              <option value="all">Người thực hiện: Tất cả</option>
              {members.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
            </select>
          </div>
          {view === 'list'
            ? <TaskTable tasks={filtered} showContext={false} emptyText="Không có công việc phù hợp" />
            : <KanbanBoard tasks={filtered} />}
        </>
      )}

      {tab === 'members' && (
        <div className="card">
          {canManageMembers && (
            <div className="member-add filter-row">
              <select value={addUser} onChange={(e) => setAddUser(e.target.value)}>
                <option value="">+ Chọn người để thêm…</option>
                {nonMembers.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
              </select>
              <button className="btn btn-primary" disabled={!addUser} onClick={() => { addProjectMember(channel.id, addUser); setAddUser('') }}>
                <UserPlus size={15} /> Thêm
              </button>
            </div>
          )}
          <div className="member-list">
            {members.map((u) => (
              <div key={u.id} className="member-row">
                <span className="cell-user"><Avatar user={u} size={30} /> {u.displayName}</span>
                <span className="member-role">{u.id === channel.ownerId ? 'Chủ dự án' : 'Thành viên'}</span>
                {canManageMembers && u.id !== channel.ownerId && (
                  <button className="btn btn-ghost row-action" title="Xóa khỏi dự án" onClick={() => removeProjectMember(channel.id, u.id)}>
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="card">
          {channelActivities.length === 0 && <EmptyState title="Chưa có hoạt động nào" />}
          <div className="activity-list">
            {channelActivities.map((a) => {
              const u = usersById[a.userId]
              const task = getTask(a.taskId)
              return (
                <button key={a.id} className="activity-item clickable" onClick={() => selectTask(a.taskId)}>
                  <Avatar user={u} size={24} />
                  <span><strong>{u?.displayName}</strong> {activityText(a, usersById)}{' — '}<em>{task?.title}</em></span>
                  <span className="muted">{timeAgo(a.createdAt)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
