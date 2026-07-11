import { useState } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import {
  Home, CheckSquare, Hash, Inbox, MoreHorizontal, Building2, BarChart3, Settings, LogOut, X, Target,
} from 'lucide-react'
import { useApp } from '../../store/AppContext'
import { deptColor } from '../../utils/color'
import { useAuth } from '../../auth/AuthProvider'
import { orgUnitDisplayName } from '../../utils/org'

/** Sheet trượt từ đáy màn hình (mobile action sheet). */
function MobileActionSheet({ title, onClose, children }) {
  return (
    <div className="sheet-root">
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet" onClick={(e) => { if (e.target.closest('a,button.sheet-item')) onClose() }}>
        <div className="sheet-head">
          <span className="sheet-title">{title}</span>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

/** Bottom navigation cố định cho mobile. */
export default function MobileNav() {
  const { unreadCount: unread, visibleDepartments, visibleChannels, canViewActionLog } = useApp()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState(null) // null | 'projects' | 'more'

  const itemClass = ({ isActive }) => `mnav-item ${isActive ? 'active' : ''}`

  return (
    <>
      <nav className="mobile-nav">
        <NavLink to="/" end className={itemClass}>
          <Home size={21} /><span>Trang chủ</span>
        </NavLink>
        <NavLink to="/my-tasks" className={itemClass}>
          <CheckSquare size={21} /><span>Việc của tôi</span>
        </NavLink>
        <button
          className={`mnav-item ${sheet === 'projects' ? 'active' : ''}`}
          onClick={() => setSheet('projects')}
        >
          <Hash size={21} /><span>Dự án</span>
        </button>
        <NavLink to="/inbox" className={itemClass}>
          <span className="mnav-icon-wrap">
            <Inbox size={21} />
            {unread > 0 && <span className="mnav-badge">{unread > 9 ? '9+' : unread}</span>}
          </span>
          <span>Thông báo</span>
        </NavLink>
        <button
          className={`mnav-item ${sheet === 'more' ? 'active' : ''}`}
          onClick={() => setSheet('more')}
        >
          <MoreHorizontal size={21} /><span>Thêm</span>
        </button>
      </nav>

      {sheet === 'projects' && (
        <MobileActionSheet title="Dự án" onClose={() => setSheet(null)}>
          {visibleChannels.length === 0 && <p className="muted sheet-empty">Chưa có dự án nào.</p>}
          {visibleChannels.map((c) => (
            <Link key={c.id} to={`/channels/${c.id}`} className="sheet-item">
              <Hash size={17} /> {c.name}
            </Link>
          ))}
        </MobileActionSheet>
      )}

      {sheet === 'more' && (
        <MobileActionSheet title="Thêm" onClose={() => setSheet(null)}>
          <div className="sheet-group-title"><Building2 size={13} /> Phòng ban</div>
          {visibleDepartments.map((d) => (
            <Link key={d.id} to={`/departments/${d.id}`} className="sheet-item">
              <span className="side-dot" style={{ background: deptColor(d.code) }} /> {orgUnitDisplayName(d, visibleDepartments)}
            </Link>
          ))}
          <div className="sheet-divider" />
          {canViewActionLog && (
            <Link to="/action-log" className="sheet-item"><Target size={17} /> Action Log</Link>
          )}
          <Link to="/reports" className="sheet-item"><BarChart3 size={17} /> Thống kê</Link>
          <Link to="/settings" className="sheet-item"><Settings size={17} /> Cài đặt</Link>
          <button
            className="sheet-item danger"
            onClick={() => { setSheet(null); logout(); navigate('/') }}
          >
            <LogOut size={17} /> Đăng xuất
          </button>
        </MobileActionSheet>
      )}
    </>
  )
}
