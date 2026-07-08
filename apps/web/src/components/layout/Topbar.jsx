import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Plus, Menu, Hash, Building2 } from 'lucide-react'
import BrandLogo from '../shared/BrandLogo'
import { useApp } from '../../store/AppContext'
import { useAuth } from '../../auth/AuthProvider'
import Avatar from '../shared/Avatar'
import Dropdown from '../shared/Dropdown'
import { StatusBadge } from '../shared/badges'
import { ROLES } from '../../data/constants'

export default function Topbar({ onMenu }) {
  const {
    state, currentUser, selectTask, openCreateModal, taskContextLabel,
    visibleDepartments, visibleChannels, usersById,
  } = useApp()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  // Search nhanh (client, ưu tiên tốc độ): task / dự án / phòng ban / người dùng
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    const has = (s) => (s || '').toLowerCase().includes(q)
    return {
      tasks: state.tasks.filter((t) => has(t.title)).slice(0, 6),
      projects: visibleChannels.filter((c) => has(c.name)).slice(0, 4),
      departments: visibleDepartments.filter((d) => has(d.name) || has(d.code)).slice(0, 4),
      users: state.users.filter((u) => has(u.displayName) || has(u.email)).slice(0, 4),
    }
  }, [query, state.tasks, state.users, visibleChannels, visibleDepartments])

  const total = results
    ? results.tasks.length + results.projects.length + results.departments.length + results.users.length
    : 0
  const go = (path) => { navigate(path); setQuery('') }

  return (
    <header className="topbar">
      <button className="btn btn-ghost mobile-only topbar-menu" onClick={onMenu} aria-label="Mở menu">
        <Menu size={22} />
      </button>
      <span className="topbar-brand mobile-only">
        <BrandLogo size={20} /> <strong>Giao việc</strong>
      </span>
      <div className="search-box">
        <Search size={16} className="search-icon" />
        <input
          className="search-input"
          placeholder="Tìm công việc, dự án, phòng ban, người…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && results && (
          <div className="search-results">
            {total === 0 && <div className="search-empty">Không tìm thấy kết quả nào</div>}
            {results.tasks.length > 0 && <div className="search-group">Công việc</div>}
            {results.tasks.map((t) => (
              <button key={t.id} className="search-result" onClick={() => { selectTask(t.id); setQuery('') }}>
                <span className="search-result-title">{t.title}</span>
                <span className="search-result-meta">{taskContextLabel(t)} · <StatusBadge status={t.status} /></span>
              </button>
            ))}
            {results.projects.length > 0 && <div className="search-group">Dự án</div>}
            {results.projects.map((c) => (
              <button key={c.id} className="search-result" onClick={() => go(`/channels/${c.id}`)}>
                <span className="search-result-title"><Hash size={13} /> {c.name}</span>
              </button>
            ))}
            {results.departments.length > 0 && <div className="search-group">Phòng ban</div>}
            {results.departments.map((d) => (
              <button key={d.id} className="search-result" onClick={() => go(`/departments/${d.id}`)}>
                <span className="search-result-title"><Building2 size={13} /> {d.name}</span>
              </button>
            ))}
            {results.users.length > 0 && <div className="search-group">Người dùng</div>}
            {results.users.map((u) => (
              <div key={u.id} className="search-result search-result-static">
                <span className="search-result-title"><Avatar user={u} size={20} /> {u.displayName}</span>
                <span className="search-result-meta">{u.email}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="topbar-actions">
        <button className="btn btn-primary" onClick={() => openCreateModal()}>
          <Plus size={16} /> <span className="hide-mobile">Tạo công việc</span>
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
          <button className="dropdown-item" onClick={logout}>Đăng xuất</button>
        </Dropdown>
      </div>
    </header>
  )
}
