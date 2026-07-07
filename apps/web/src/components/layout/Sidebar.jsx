import { NavLink } from 'react-router-dom'
import {
  Home, CheckSquare, Inbox, BarChart3, Settings, Building2, Hash,
} from 'lucide-react'
import { useApp } from '../../store/AppContext'
import { deptColor } from '../../utils/color'
import Avatar from '../shared/Avatar'
import BrandLogo from '../shared/BrandLogo'
import { ROLES } from '../../data/constants'

export default function Sidebar() {
  const { currentUser, unreadCount: unread, blocks, visibleDepartments, visibleChannels } = useApp()
  // Nhóm phòng ban theo khối (chỉ khối có phòng đang thấy)
  const deptGroups = (blocks || [])
    .map((b) => ({ block: b, depts: visibleDepartments.filter((d) => d.blockId === b.id) }))
    .filter((g) => g.depts.length > 0)
  const ungrouped = visibleDepartments.filter((d) => !blocks?.some((b) => b.id === d.blockId))

  const linkClass = ({ isActive }) => `side-link ${isActive ? 'active' : ''}`

  return (
    <aside className="sidebar">
      <div className="side-brand">
        <span className="brand-logo"><BrandLogo size={20} /></span>
        <span className="brand-name">Giao việc</span>
      </div>

      <nav className="side-nav">
        <NavLink to="/" end className={linkClass}>
          <Home size={17} /> Trang chủ
        </NavLink>
        <NavLink to="/my-tasks" className={linkClass}>
          <CheckSquare size={17} /> Việc của tôi
        </NavLink>
        <NavLink to="/inbox" className={linkClass}>
          <Inbox size={17} /> Thông báo
          {unread > 0 && <span className="side-badge">{unread}</span>}
        </NavLink>
        <NavLink to="/reports" className={linkClass}>
          <BarChart3 size={17} /> Báo cáo
        </NavLink>

        {deptGroups.map((g) => (
          <div className="side-section" key={g.block.id}>
            <span className="side-section-title"><Building2 size={13} /> {g.block.name}</span>
            {g.depts.map((d) => (
              <NavLink key={d.id} to={`/departments/${d.id}`} className={linkClass}>
                <span className="side-dot" style={{ background: deptColor(d.code) }} />
                <span className="side-link-text">{d.name}</span>
              </NavLink>
            ))}
          </div>
        ))}
        {ungrouped.length > 0 && (
          <div className="side-section">
            <span className="side-section-title"><Building2 size={13} /> Phòng ban</span>
            {ungrouped.map((d) => (
              <NavLink key={d.id} to={`/departments/${d.id}`} className={linkClass}>
                <span className="side-dot" style={{ background: deptColor(d.code) }} />
                <span className="side-link-text">{d.name}</span>
              </NavLink>
            ))}
          </div>
        )}

        <div className="side-section">
          <span className="side-section-title"><Hash size={13} /> Dự án</span>
          {visibleChannels.map((c) => (
            <NavLink key={c.id} to={`/channels/${c.id}`} className={linkClass}>
              <Hash size={15} className="side-hash" />
              <span className="side-link-text">{c.name}</span>
            </NavLink>
          ))}
        </div>

        <div className="side-section">
          <NavLink to="/settings" className={linkClass}>
            <Settings size={17} /> Cài đặt
          </NavLink>
        </div>
      </nav>

      <div className="side-user">
        <Avatar user={currentUser} size={32} />
        <div className="side-user-info">
          <span className="side-user-name">{currentUser.displayName}</span>
          <span className="side-user-role">{ROLES[currentUser.role]}</span>
        </div>
      </div>
    </aside>
  )
}
