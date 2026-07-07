import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useApp } from '../store/AppContext'
import TaskTable from '../components/task/TaskTable'
import { isOverdue, isDueToday, isUpcoming } from '../utils/date'

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'today', label: 'Hôm nay' },
  { key: 'upcoming', label: 'Sắp đến hạn' },
  { key: 'overdue', label: 'Quá hạn' },
  { key: 'review', label: 'Nghiệm thu' },
  { key: 'done', label: 'Đã hoàn thành' },
]

const inReview = (t) => t.status === 'submitted' || t.status === 'returned'

export default function MyTasks() {
  const { myTasks, openCreateModal } = useApp()
  const [tab, setTab] = useState('all')

  const all = myTasks()
  const filtered = useMemo(() => {
    const list = (() => {
      switch (tab) {
        case 'today': return all.filter(isDueToday)
        case 'upcoming': return all.filter((t) => isUpcoming(t))
        case 'overdue': return all.filter(isOverdue)
        case 'review': return all.filter(inReview)
        case 'done': return all.filter((t) => t.status === 'done')
        default: return all
      }
    })()
    // Chưa hoàn thành lên trước, sắp hết hạn lên trước
    return [...list].sort((a, b) => {
      if ((a.status === 'done') !== (b.status === 'done')) {
        return a.status === 'done' ? 1 : -1
      }
      return new Date(a.dueDate || '2099-01-01') - new Date(b.dueDate || '2099-01-01')
    })
  }, [tab, all])

  const counts = {
    all: all.length,
    today: all.filter(isDueToday).length,
    upcoming: all.filter((t) => isUpcoming(t)).length,
    overdue: all.filter(isOverdue).length,
    review: all.filter(inReview).length,
    done: all.filter((t) => t.status === 'done').length,
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Việc của tôi</h1>
        <button
          className="btn"
          onClick={() => openCreateModal({ scope: 'personal' })}
        >
          <Plus size={15} /> Tạo task cá nhân
        </button>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} <span className="tab-count">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <TaskTable tasks={filtered} emptyText="Không có công việc nào trong mục này" />
    </div>
  )
}
