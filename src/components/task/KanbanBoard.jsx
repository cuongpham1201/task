import { useState } from 'react'
import { MessageSquare, GitBranch } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'
import { KANBAN_COLUMNS, STATUS, PRIORITY } from '../../data/constants'
import { dueLabel } from '../../utils/date'

function KanbanCard({ task, onDragStart }) {
  const { usersById, perms, selectTask, getSubtasks, getComments } = useApp()
  const assignee = usersById[task.assigneeId]
  const subs = getSubtasks(task.id)
  const commentCount = getComments(task.id).length
  const due = dueLabel(task)
  // Chỉ cho kéo thả khi có quyền đổi trạng thái (guard trong store vẫn chặn lần nữa)
  const canDrag = perms.updateStatus(task)

  return (
    <div
      className="kanban-card"
      draggable={canDrag}
      onDragStart={(e) => {
        if (!canDrag) { e.preventDefault(); return }
        onDragStart(e, task)
      }}
      onClick={() => selectTask(task.id)}
    >
      <span className={`kanban-priority priority-${task.priority}`}>
        {PRIORITY[task.priority].label}
      </span>
      <p className="kanban-title">{task.title}</p>
      <div className="kanban-meta">
        {assignee && <Avatar user={assignee} size={22} />}
        <span className={`kanban-due due-${due.tone}`}>{due.text}</span>
        <span className="kanban-icons">
          {subs.length > 0 && (
            <span className="meta-icon">
              <GitBranch size={12} /> {subs.filter((s) => s.done).length}/{subs.length}
            </span>
          )}
          {commentCount > 0 && (
            <span className="meta-icon"><MessageSquare size={12} /> {commentCount}</span>
          )}
        </span>
      </div>
    </div>
  )
}

export default function KanbanBoard({ tasks }) {
  const { setStatus } = useApp()
  const [dragOver, setDragOver] = useState(null)

  const onDragStart = (e, task) => {
    e.dataTransfer.setData('text/task-id', task.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDrop = (e, status) => {
    e.preventDefault()
    setDragOver(null)
    const id = e.dataTransfer.getData('text/task-id')
    if (id) setStatus(id, status)
  }

  return (
    <div className="kanban">
      {KANBAN_COLUMNS.map((col) => {
        const items = tasks.filter((t) => t.status === col)
        return (
          <div
            key={col}
            className={`kanban-col ${dragOver === col ? 'drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(col) }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => onDrop(e, col)}
          >
            <div className="kanban-col-head">
              <span className={`badge status-${col}`}>{STATUS[col].label}</span>
              <span className="kanban-count">{items.length}</span>
            </div>
            <div className="kanban-col-body">
              {items.map((t) => (
                <KanbanCard key={t.id} task={t} onDragStart={onDragStart} />
              ))}
              {items.length === 0 && <div className="kanban-empty">Kéo thả task vào đây</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
