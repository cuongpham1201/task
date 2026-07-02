import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'
import Dropdown from '../shared/Dropdown'
import { StatusBadge } from '../shared/badges'
import { ROLES } from '../../data/constants'

export default function Topbar() {
  const { state, currentUser, selectTask, openCreateModal, taskContextLabel } = useApp()
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return state.tasks
      .filter((t) => t.title.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, state.tasks])

  return (
    <header className="topbar">
      <div className="search-box">
        <Search size={16} className="search-icon" />
        <input
          className="search-input"
          placeholder="Tìm kiếm công việc…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <div className="search-results">
            {results.length === 0 && (
              <div className="search-empty">Không tìm thấy công việc nào</div>
            )}
            {results.map((t) => (
              <button
                key={t.id}
                className="search-result"
                onClick={() => { selectTask(t.id); setQuery('') }}
              >
                <span className="search-result-title">{t.title}</span>
                <span className="search-result-meta">
                  {taskContextLabel(t)} · <StatusBadge status={t.status} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="topbar-actions">
        <button className="btn btn-primary" onClick={() => openCreateModal()}>
          <Plus size={16} /> Tạo công việc
        </button>
        <Dropdown
          align="right"
          trigger={<button className="avatar-btn"><Avatar user={currentUser} size={32} /></button>}
        >
          <div className="user-menu-header">
            <strong>{currentUser.displayName}</strong>
            <span>{currentUser.email}</span>
            <span className="user-menu-role">{ROLES[currentUser.role]}</span>
          </div>
          <Link to="/settings" className="dropdown-item">Cài đặt tài khoản</Link>
          <button className="dropdown-item" disabled>Đăng xuất (demo)</button>
        </Dropdown>
      </div>
    </header>
  )
}
