import { X } from 'lucide-react'
import { useApp } from '../../store/AppContext'

// Toast nhẹ (thay alert). Đọc từ AppContext.toasts, tự ẩn sau vài giây.
export default function Toaster() {
  const { toasts, dismissToast } = useApp()
  if (!toasts?.length) return null
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type || 'error'}`}>
          <span>{t.message}</span>
          <button className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Đóng">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
