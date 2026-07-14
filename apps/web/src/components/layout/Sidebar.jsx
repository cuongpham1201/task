import { NavLink } from 'react-router-dom'
import {
  Home, CheckSquare, Inbox, BarChart3, Settings, Building2, Hash, Target, Plus, ChevronDown, ChevronRight,
} from 'lucide-react'
import { useApp } from '../../store/AppContext'
import { useLocalStorage } from '../../utils/useLocalStorage'
import { deptColor } from '../../utils/color'
import Avatar from '../shared/Avatar'
import BrandLogo from '../shared/BrandLogo'
import { roleLabel } from '../../data/constants'
import { orgUnitDisplayName } from '../../utils/org'

const MIN_W = 180
const MAX_W = 460

export default function Sidebar() {
  const { currentUser, unreadCount: unread, blocks, visibleDepartments, visibleChannels, canViewActionLog, permissions, openCreateProjectModal } = useApp()
  // Nhóm phòng ban theo khối (chỉ khối có phòng đang thấy)
  const deptGroups = (blocks || [])
    .map((b) => ({ block: b, depts: visibleDepartments.filter((d) => d.blockId === b.id) }))
    .filter((g) => g.depts.length > 0)
  const ungrouped = visibleDepartments.filter((d) => !blocks?.some((b) => b.id === d.blockId))

  // Gập/mở từng khối — MẶC ĐỊNH gập (open[key] === true mới là mở); nhớ theo trình duyệt.
  const [openMap, setOpenMap] = useLocalStorage('sidebar.open', {})
  const isOpen = (key) => openMap[key] === true
  const toggle = (key) => setOpenMap((m) => ({ ...m, [key]: !(m[key] === true) }))

  // Kéo chỉnh độ rộng sidebar (nhớ theo trình duyệt)
  const [width, setWidth] = useLocalStorage('sidebar.width', 244)
  const startResize = (e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const onMove = (ev) => setWidth(Math.min(MAX_W, Math.max(MIN_W, startW + (ev.clientX - startX))))
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.classList.remove('resizing-x')
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.classList.add('resizing-x')
  }

  const linkClass = ({ isActive }) => `side-link ${isActive ? 'active' : ''}`

  const Section = ({ id, icon, title, action, children }) => {
    const open = isOpen(id)
    return (
      <div className="side-section">
        <div className="side-section-title">
          <button className="side-section-toggle" onClick={() => toggle(id)}>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {icon}
            <span className="side-section-name">{title}</span>
          </button>
          {action}
        </div>
        {open && children}
      </div>
    )
  }

  return (
    <aside className="sidebar" style={{ '--sidebar-w': `${width}px` }}>
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
        {canViewActionLog && (
          <NavLink to="/action-log" className={linkClass}>
            <Target size={17} /> Action Log
          </NavLink>
        )}
        <NavLink to="/inbox" className={linkClass}>
          <Inbox size={17} /> Thông báo
          {unread > 0 && <span className="side-badge">{unread}</span>}
        </NavLink>
        {permissions.canViewReports && (
          <NavLink to="/reports" className={linkClass}>
            <BarChart3 size={17} /> Báo cáo
          </NavLink>
        )}

        {deptGroups.map((g) => (
          <Section key={g.block.id} id={`blk:${g.block.id}`} icon={<Building2 size={13} />} title={g.block.name}>
            {g.depts.map((d) => (
              <NavLink key={d.id} to={`/departments/${d.id}`} className={linkClass}>
                <span className="side-dot" style={{ background: deptColor(d.code) }} />
                <span className="side-link-text">{orgUnitDisplayName(d, visibleDepartments)}</span>
              </NavLink>
            ))}
          </Section>
        ))}
        {ungrouped.length > 0 && (
          <Section id="ungrouped" icon={<Building2 size={13} />} title="Phòng ban">
            {ungrouped.map((d) => (
              <NavLink key={d.id} to={`/departments/${d.id}`} className={linkClass}>
                <span className="side-dot" style={{ background: deptColor(d.code) }} />
                <span className="side-link-text">{orgUnitDisplayName(d, visibleDepartments)}</span>
              </NavLink>
            ))}
          </Section>
        )}

        <Section
          id="projects"
          icon={<Hash size={13} />}
          title="Dự án"
          action={<button className="side-add" title="Tạo dự án" onClick={openCreateProjectModal}><Plus size={13} /></button>}
        >
          {visibleChannels.map((c) => (
            <NavLink key={c.id} to={`/channels/${c.id}`} className={linkClass}>
              <Hash size={15} className="side-hash" />
              <span className="side-link-text">{c.name}</span>
            </NavLink>
          ))}
        </Section>

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
          <span className="side-user-role">{roleLabel(currentUser.role)}</span>
        </div>
      </div>

      <div className="sidebar-resizer" onMouseDown={startResize} title="Kéo để đổi độ rộng" />
    </aside>
  )
}
