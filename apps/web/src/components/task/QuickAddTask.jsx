import { useState } from 'react'
import { Plus, CornerDownLeft } from 'lucide-react'
import { useApp } from '../../store/AppContext'

/**
 * Thêm nhanh 1 công việc bằng 1 dòng (Enter). Kế thừa ngữ cảnh (scope/dept/channel/action).
 * Assignee mặc định = mình; các trường khác dùng default → mở Detail để bổ sung sau.
 */
export default function QuickAddTask({ scope = 'personal', departmentId = null, channelId = null, actionId = null, placeholder }) {
  const { createTask, currentUser } = useApp()
  const [title, setTitle] = useState('')

  const submit = () => {
    const t = title.trim()
    if (!t) return
    createTask({
      title: t,
      scope,
      personal: scope === 'personal', // A: "Thêm nhanh việc cá nhân" = riêng tư (không gắn phòng)
      departmentId: scope === 'department' ? departmentId : null,
      channelId: scope === 'channel' ? channelId : null,
      actionId: actionId || null,
      assigneeId: currentUser.id,
    })
    setTitle('')
  }

  return (
    <div className="quick-add">
      <Plus size={16} className="muted" />
      <input
        value={title}
        placeholder={placeholder || 'Thêm nhanh công việc… (Enter)'}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
      />
      {title.trim() && <button className="btn btn-primary btn-sm" onClick={submit}><CornerDownLeft size={14} /></button>}
    </div>
  )
}
