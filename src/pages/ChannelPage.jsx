import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { List, Kanban, Activity, Paperclip, Plus, Hash } from 'lucide-react'
import { useApp } from '../store/AppContext'
import TaskTable from '../components/task/TaskTable'
import KanbanBoard from '../components/task/KanbanBoard'
import Avatar, { AvatarGroup } from '../components/shared/Avatar'
import EmptyState from '../components/shared/EmptyState'
import { STATUS, STATUS_ORDER } from '../data/constants'
import { activityText } from '../utils/activity'
import { timeAgo, isOverdue, isUpcoming } from '../utils/date'

const TABS = [
  { key: 'list', label: 'Danh sách', icon: List },
  { key: 'board', label: 'Bảng', icon: Kanban },
  { key: 'activity', label: 'Hoạt động', icon: Activity },
  { key: 'files', label: 'Tệp đính kèm', icon: Paperclip },
]

export default function ChannelPage() {
  const { id } = useParams()
  const { state, usersById, perms, channelTasks, openCreateModal, getTask, selectTask } = useApp()
  const [tab, setTab] = useState('list')
  const [statusFilter, setStatusFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [dueFilter, setDueFilter] = useState('all')

  const channel = state.channels.find((c) => c.id === id)

  const allTasks = channel ? channelTasks(channel.id) : []
  const filtered = useMemo(() => allTasks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (assigneeFilter !== 'all' && t.assigneeId !== assigneeFilter) return false
    if (dueFilter === 'overdue' && !isOverdue(t)) return false
    if (dueFilter === 'week' && !isUpcoming(t, 7)) return false
    return true
  }), [allTasks, statusFilter, assigneeFilter, dueFilter])

  const channelActivities = useMemo(() => {
    if (!channel) return []
    const ids = new Set(allTasks.map((t) => t.id))
    return state.activities
      .filter((a) => ids.has(a.taskId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [channel, allTasks, state.activities])

  if (!channel) return <div className="page"><p>Không tìm thấy channel.</p></div>

  const members = channel.members.map((uid) => usersById[uid]).filter(Boolean)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1><Hash size={20} className="side-hash" /> {channel.name}</h1>
          <p className="page-sub">{channel.description}</p>
        </div>
        <div className="page-head-actions">
          <AvatarGroup users={members} />
          {perms.createChannelTask(channel) && (
            <button
              className="btn btn-primary"
              onClick={() => openCreateModal({ scope: 'channel', channelId: channel.id })}
            >
              <Plus size={15} /> Tạo công việc
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {(tab === 'list' || tab === 'board') && (
        <div className="filter-row">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Trạng thái: Tất cả</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS[s].label}</option>
            ))}
          </select>
          <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
            <option value="all">Người phụ trách: Tất cả</option>
            {members.map((u) => (
              <option key={u.id} value={u.id}>{u.displayName}</option>
            ))}
          </select>
          <select value={dueFilter} onChange={(e) => setDueFilter(e.target.value)}>
            <option value="all">Hạn: Tất cả</option>
            <option value="overdue">Quá hạn</option>
            <option value="week">Trong 7 ngày tới</option>
          </select>
        </div>
      )}

      {tab === 'list' && (
        <TaskTable tasks={filtered} showContext={false} emptyText="Không có công việc phù hợp bộ lọc" />
      )}
      {tab === 'board' && <KanbanBoard tasks={filtered} />}

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
                  <span>
                    <strong>{u?.displayName}</strong> {activityText(a, usersById)}
                    {' — '}<em>{task?.title}</em>
                  </span>
                  <span className="muted">{timeAgo(a.createdAt)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'files' && (
        <EmptyState
          icon={Paperclip}
          title="Tính năng đính kèm tệp sẽ có ở phiên bản sau"
          hint="Phase 3: tích hợp lưu trữ tệp và Microsoft 365."
        />
      )}
    </div>
  )
}
