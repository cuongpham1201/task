import { CheckCircle2, Circle, MessageSquare, GitBranch } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'
import { StatusBadge, PriorityBadge } from '../shared/badges'
import { dueLabel } from '../../utils/date'

/**
 * Card công việc cho mobile — thay bảng nhiều cột.
 * Hiển thị: tên, trạng thái, hạn, ưu tiên, người thực hiện, ngữ cảnh, tiến độ, đếm comment/subtask.
 */
export default function TaskCardMobile({ task, showContext = true }) {
  const {
    usersById, perms, selectTask, toggleComplete, getSubtasks, getComments, taskContextLabel, taskContextFull,
  } = useApp()
  const ctx = taskContextFull(task)
  const assignee = usersById[task.assigneeId]
  const subs = getSubtasks(task.id)
  const commentCount = getComments(task.id).length
  const due = dueLabel(task)
  const isDone = task.status === 'done'
  const canStatus = perms.updateStatus(task)

  return (
    <button className={`task-card ${isDone ? 'done' : ''}`} onClick={() => selectTask(task.id)}>
      <div className="task-card-top">
        <span
          className={`tick ${isDone ? 'ticked' : ''}`}
          role="button"
          aria-disabled={!canStatus}
          onClick={(e) => {
            e.stopPropagation()
            if (canStatus) toggleComplete(task)
          }}
        >
          {isDone ? <CheckCircle2 size={22} /> : <Circle size={22} />}
        </span>
        <span className="task-card-title">{task.title}</span>
      </div>
      <div className="task-subline">
        {ctx.requestUnitName && <span className="chip chip-unit">{ctx.requestUnitName}</span>}
        {ctx.actionTitle && <span className="chip chip-action">🎯 {ctx.actionTitle}</span>}
        {ctx.projectName && <span className="chip chip-project"># {ctx.projectName}</span>}
        {ctx.review && <span className="chip chip-review">Nghiệm thu</span>}
      </div>
      <div className="task-card-badges">
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
        <span className={`task-card-due due-${due.tone}`}>{due.text}</span>
      </div>
      {task.progress > 0 && (
        <div className="task-card-progress">
          <span className="progress-track" style={{ width: '100%' }}>
            <span
              className={`progress-fill ${task.progress >= 100 ? 'complete' : ''}`}
              style={{ width: `${task.progress}%` }}
            />
          </span>
        </div>
      )}
      <div className="task-card-foot">
        {assignee && (
          <span className="cell-user small">
            <Avatar user={assignee} size={20} /> {assignee.displayName}
          </span>
        )}
        <span className="task-card-meta">
          {showContext && <span className="task-card-context">{taskContextLabel(task)}</span>}
          {subs.length > 0 && (
            <span className="meta-icon"><GitBranch size={12} /> {subs.filter((s) => s.done).length}/{subs.length}</span>
          )}
          {commentCount > 0 && (
            <span className="meta-icon"><MessageSquare size={12} /> {commentCount}</span>
          )}
        </span>
      </div>
    </button>
  )
}
