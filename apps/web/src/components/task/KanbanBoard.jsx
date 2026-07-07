import { useState } from 'react'
import { MessageSquare, GitBranch } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'
import { KANBAN_COLUMNS, STATUS, PRIORITY } from '../../data/constants'
import { dueLabel } from '../../utils/date'

// Cột trạng thái nghiệm thu: chỉ hiển thị khi có task, KHÔNG cho kéo thả vào/ra
// (chuyển bằng nút Nộp nghiệm thu / Đạt / Trả lại trong chi tiết task)
const REVIEW_COLUMNS = ['submitted', 'returned']

function KanbanCard({ task, onDragStart }) {
  const { usersById, perms, selectTask, getSubtasks, getComments } = useApp()
  const assignee = usersById[task.assigneeId]
  const subs = getSubtasks(task.id)
  const commentCount = getComments(task.id).length
  const due = dueLabel(task)
  // Chỉ cho kéo khi có quyền đổi trạng thái; task chờ nghiệm thu thì khóa kéo
  const canDrag = perms.updateStatus(task) && task.status !== 'submitted'

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
    if (REVIEW_COLUMNS.includes(status)) return // vào nghiệm thu = qua nút Nộp, không kéo
    const id = e.dataTransfer.getData('text/task-id')
    if (id) setStatus(id, status)
  }

  // Cột nghiệm thu chỉ chen vào khi có task (giữ board gọn)
  const columns = [
    ...KANBAN_COLUMNS.slice(0, -1), // todo, doing, waiting
    ...REVIEW_COLUMNS.filter((c) => tasks.some((t) => t.status === c)),
    KANBAN_COLUMNS[KANBAN_COLUMNS.length - 1], // done
  ]

  return (
    <div className="kanban">
      {columns.map((col) => {
        const items = tasks.filter((t) => t.status === col)
        const isReviewCol = REVIEW_COLUMNS.includes(col)
        return (
          <div
            key={col}
            className={`kanban-col ${dragOver === col ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              if (isReviewCol) return
              e.preventDefault()
              setDragOver(col)
            }}
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
              {items.length === 0 && (
                <div className="kanban-empty">
                  {isReviewCol ? 'Chuyển qua luồng nghiệm thu' : 'Kéo thả task vào đây'}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
