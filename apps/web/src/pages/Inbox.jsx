import { CheckCheck, Inbox as InboxIcon } from 'lucide-react'
import { useApp } from '../store/AppContext'
import Avatar from '../components/shared/Avatar'
import EmptyState from '../components/shared/EmptyState'
import { activityText } from '../utils/activity'
import { timeAgo } from '../utils/date'

// Nhãn dự phòng theo loại thông báo (khi không suy được từ action/metadata)
const TYPE_TEXT = {
  task_assigned: 'đã giao việc cho bạn',
  comment_added: 'đã bình luận',
  mentioned: 'đã nhắc đến bạn',
  due_soon: 'công việc sắp đến hạn',
  overdue: 'công việc đã quá hạn',
  task_returned: 'đã trả lại công việc',
  task_accepted: 'đã nghiệm thu công việc',
}

export default function Inbox() {
  const { notifications, unreadCount, usersById, getTask, selectTask, markInboxRead } = useApp()

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <h1>Thông báo</h1>
        <button className="btn" onClick={markInboxRead} disabled={unreadCount === 0}>
          <CheckCheck size={15} /> Đánh dấu đã đọc
        </button>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title="Không có thông báo nào"
          hint="Thông báo xuất hiện khi bạn được giao việc, được nhắc đến, có bình luận hoặc kết quả nghiệm thu."
        />
      ) : (
        <div className="inbox-list">
          {notifications.map((n) => {
            const task = getTask(n.taskId)
            const actor = n.actorId ? usersById[n.actorId] : null
            const text = n.action
              ? activityText({ action: n.action, metadata: n.metadata }, usersById)
              : TYPE_TEXT[n.type] || 'có cập nhật mới'
            const unread = !n.readAt
            return (
              <button
                key={n.id}
                className={`inbox-item ${unread ? 'unread' : ''}`}
                onClick={() => task && selectTask(task.id)}
              >
                <Avatar user={actor} size={32} />
                <span className="inbox-content">
                  <span>
                    {actor ? <strong>{actor.displayName}</strong> : <strong>Hệ thống</strong>} {text}
                  </span>
                  <span className="inbox-task">{task?.title || '(Công việc đã lưu trữ)'}</span>
                </span>
                <span className="inbox-time">{timeAgo(n.createdAt)}</span>
                {unread && <span className="inbox-dot" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
