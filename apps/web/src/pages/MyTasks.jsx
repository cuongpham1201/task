import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useApp } from '../store/AppContext'
import TaskTable from '../components/task/TaskTable'
import QuickAddTask from '../components/task/QuickAddTask'
import { STATUS } from '../data/constants'
import { isOverdue, isDueToday, isUpcoming } from '../utils/date'
import { useLocalStorage } from '../utils/useLocalStorage'

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'today', label: 'Hôm nay' },
  { key: 'upcoming', label: 'Sắp đến hạn' },
  { key: 'overdue', label: 'Quá hạn' },
  { key: 'review', label: 'Nghiệm thu' },
  { key: 'done', label: 'Đã hoàn thành' },
]
const PRANK = { urgent: 0, high: 1, normal: 2, low: 3 }
const inReview = (t) => t.status === 'submitted' || t.status === 'returned'

export default function MyTasks() {
  const { myTasks, openCreateModal, channelsById } = useApp()
  const [tab, setTab] = useLocalStorage('mytasks.tab', 'all')
  const [sortBy, setSortBy] = useLocalStorage('mytasks.sort', 'due')
  const [groupBy, setGroupBy] = useLocalStorage('mytasks.group', 'none')

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
    const sorters = {
      due: (a, b) => new Date(a.dueDate || '2099-01-01') - new Date(b.dueDate || '2099-01-01'),
      priority: (a, b) => (PRANK[a.priority] ?? 9) - (PRANK[b.priority] ?? 9),
      updated: (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
    }
    return [...list].sort((a, b) => {
      if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1
      return (sorters[sortBy] || sorters.due)(a, b)
    })
  }, [tab, all, sortBy])

  const counts = {
    all: all.length,
    today: all.filter(isDueToday).length,
    upcoming: all.filter((t) => isUpcoming(t)).length,
    overdue: all.filter(isOverdue).length,
    review: all.filter(inReview).length,
    done: all.filter((t) => t.status === 'done').length,
  }

  // Nhóm (nếu chọn)
  const groups = useMemo(() => {
    if (groupBy === 'none') return null
    const keyOf = (t) => {
      if (groupBy === 'status') return STATUS[t.status]?.label || t.status
      if (groupBy === 'action') return t.actionTitle || '— Không thuộc Action'
      if (groupBy === 'project') return t.projectId ? (channelsById[t.projectId]?.name || 'Dự án') : '— Không thuộc dự án'
      return ''
    }
    const map = new Map()
    for (const t of filtered) { const k = keyOf(t); if (!map.has(k)) map.set(k, []); map.get(k).push(t) }
    return [...map.entries()]
  }, [groupBy, filtered, channelsById])

  return (
    <div className="page">
      <div className="page-head">
        <h1>Việc của tôi</h1>
        <button className="btn" onClick={() => openCreateModal({ scope: 'personal' })}>
          <Plus size={15} /> Tạo task cá nhân
        </button>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label} <span className="tab-count">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="filter-row">
        <QuickAddTask scope="personal" placeholder="Thêm nhanh việc cá nhân… (Enter)" />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="due">Sắp xếp: Hạn</option>
          <option value="priority">Sắp xếp: Ưu tiên</option>
          <option value="updated">Sắp xếp: Mới cập nhật</option>
        </select>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
          <option value="none">Nhóm: Không</option>
          <option value="status">Nhóm: Trạng thái</option>
          <option value="action">Nhóm: Action</option>
          <option value="project">Nhóm: Dự án</option>
        </select>
      </div>

      {groups ? (
        groups.map(([name, items]) => (
          <div key={name} className="mytasks-group">
            <h3 className="mytasks-group-title">{name} <span className="section-count">{items.length}</span></h3>
            <TaskTable tasks={items} emptyText="—" />
          </div>
        ))
      ) : (
        <TaskTable tasks={filtered} emptyText="Không có công việc nào trong mục này" />
      )}
    </div>
  )
}
