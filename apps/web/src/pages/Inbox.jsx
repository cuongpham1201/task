import {
  CheckCheck, Inbox as InboxIcon, UserPlus, MessageSquare, AtSign, ThumbsUp, Undo2, Clock, AlertTriangle,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import Avatar from '../components/shared/Avatar'
import EmptyState from '../components/shared/EmptyState'
import { activityText } from '../utils/activity'
import { timeAgo } from '../utils/date'

// Nhãn + icon dự phòng theo loại thông báo
const TYPE_META = {
  task_assigned: { text: 'đã giao việc cho bạn', icon: UserPlus, tone: 'blue' },
  comment_added: { text: 'đã bình luận', icon: MessageSquare, tone: 'gray' },
  mentioned: { text: 'đã nhắc đến bạn', icon: AtSign, tone: 'purple' },
  due_soon: { text: 'công việc sắp đến hạn', icon: Clock, tone: 'amber' },
  overdue: { text: 'công việc đã quá hạn', icon: AlertTriangle, tone: 'red' },
  task_returned: { text: 'đã trả lại công việc', icon: Undo2, tone: 'red' },
  task_accepted: { text: 'đã nghiệm thu công việc', icon: ThumbsUp, tone: 'green' },
}

function Row({ n, getTask, usersById, selectTask, markNotificationRead }) {
  const task = getTask(n.taskId)
  const actor = n.actorId ? usersById[n.actorId] : null
  const meta = TYPE_META[n.type] || { text: 'có cập nhật mới', icon: InboxIcon, tone: 'gray' }
  const Icon = meta.icon
  const text = n.action ? activityText({ action: n.action, metadata: n.metadata }, usersById) : meta.text
  const unread = !n.readAt
  return (
    <button
      className={`inbox-item ${unread ? 'unread' : ''}`}
      onClick={() => { if (unread) markNotificationRead(n.id); if (task) selectTask(task.id) }}
    >
      <span className={`inbox-type-icon tone-${meta.tone}`}><Icon size={15} /></span>
      <Avatar user={actor} size={30} />
      <span className="inbox-content">
        <span>{actor ? <strong>{actor.displayName}</strong> : <strong>Hệ thống</strong>} {text}</span>
        <span className="inbox-task">{task?.title || '(Công việc đã lưu trữ)'}</span>
      </span>
      <span className="inbox-time">{timeAgo(n.createdAt)}</span>
      {unread && <span className="inbox-dot" />}
    </button>
  )
}

export default function Inbox() {
  const {
    notifications, unreadCount, usersById, getTask, selectTask, markInboxRead, markNotificationRead,
  } = useApp()

  const unread = notifications.filter((n) => !n.readAt)
  const read = notifications.filter((n) => n.readAt)

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>Thông báo</h1>
          {unreadCount > 0 && <p className="page-sub">{unreadCount} thông báo chưa đọc</p>}
        </div>
        <button className="btn" onClick={markInboxRead} disabled={unreadCount === 0}>
          <CheckCheck size={15} /> Đánh dấu tất cả đã đọc
        </button>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title="Không có thông báo nào"
          hint="Thông báo xuất hiện khi bạn được giao việc, được nhắc đến, có bình luận hoặc kết quả nghiệm thu."
        />
      ) : (
        <>
          {unread.length > 0 && (
            <>
              <h3 className="inbox-group">Chưa đọc</h3>
              <div className="inbox-list">
                {unread.map((n) => <Row key={n.id} n={n} {...{ getTask, usersById, selectTask, markNotificationRead }} />)}
              </div>
            </>
          )}
          {read.length > 0 && (
            <>
              <h3 className="inbox-group">Trước đó</h3>
              <div className="inbox-list">
                {read.map((n) => <Row key={n.id} n={n} {...{ getTask, usersById, selectTask, markNotificationRead }} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
