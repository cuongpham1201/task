import { CheckCheck, Inbox as InboxIcon } from 'lucide-react'
import { useApp } from '../store/AppContext'
import Avatar from '../components/shared/Avatar'
import EmptyState from '../components/shared/EmptyState'
import { activityText } from '../utils/activity'
import { timeAgo } from '../utils/date'

export default function Inbox() {
  const { state, usersById, inboxItems, getTask, selectTask, markInboxRead } = useApp()
  const items = inboxItems()
  const readAt = new Date(state.inboxReadAt)

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <h1>Thông báo</h1>
        <button className="btn" onClick={markInboxRead}>
          <CheckCheck size={15} /> Đánh dấu đã đọc
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title="Không có thông báo nào"
          hint="Thông báo xuất hiện khi có hoạt động trên công việc liên quan tới bạn."
        />
      ) : (
        <div className="inbox-list">
          {items.map((a) => {
            const task = getTask(a.taskId)
            const user = usersById[a.userId]
            if (!task || !user) return null
            const unread = new Date(a.createdAt) > readAt
            return (
              <button
                key={a.id}
                className={`inbox-item ${unread ? 'unread' : ''}`}
                onClick={() => selectTask(task.id)}
              >
                <Avatar user={user} size={32} />
                <span className="inbox-content">
                  <span>
                    <strong>{user.displayName}</strong> {activityText(a, usersById)}
                  </span>
                  <span className="inbox-task">{task.title}</span>
                </span>
                <span className="inbox-time">{timeAgo(a.createdAt)}</span>
                {unread && <span className="inbox-dot" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
