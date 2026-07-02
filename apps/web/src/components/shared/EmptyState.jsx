import { ClipboardList } from 'lucide-react'

export default function EmptyState({ icon: Icon = ClipboardList, title, hint }) {
  return (
    <div className="empty-state">
      <Icon size={36} strokeWidth={1.4} />
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
    </div>
  )
}
