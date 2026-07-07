import { LogOut } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../auth/AuthProvider'
import Avatar from '../components/shared/Avatar'
import { ROLES } from '../data/constants'

export default function Settings() {
  const { state, currentUser, usersById } = useApp()
  const { logout } = useAuth()
  const isAdmin = currentUser.role === 'admin'
  const dept = state.departments.find((d) => d.id === currentUser.orgUnitId)

  return (
    <div className="page page-narrow">
      <div className="page-head"><h1>Cài đặt</h1></div>

      <div className="card">
        <div className="card-head"><h2>Tài khoản</h2></div>
        <div className="settings-profile">
          <Avatar user={currentUser} size={56} />
          <div>
            <p className="settings-name">{currentUser.displayName}</p>
            <p className="muted">{currentUser.email}</p>
            <p className="muted">{dept?.name ? `${dept.name} · ` : ''}{ROLES[currentUser.role]}</p>
          </div>
        </div>
        <p className="muted settings-hint" style={{ marginTop: 12 }}>
          Đăng nhập bằng tài khoản Microsoft 365 nội bộ. Thông tin phòng ban/chức danh
          sẽ đồng bộ từ hệ thống Nhân sự ở giai đoạn sau.
        </p>
        <button className="btn" onClick={logout}>
          <LogOut size={15} /> Đăng xuất
        </button>
      </div>

      {isAdmin && (
        <div className="card">
          <div className="card-head"><h2>Quản trị (Admin)</h2></div>
          <p className="muted settings-hint">
            Danh sách phòng ban — chỉnh sửa sẽ có ở phiên bản sau (đồng bộ từ HRM).
          </p>
          <div className="table-wrap">
            <table className="task-table settings-table">
              <thead>
                <tr><th>Phòng ban</th><th>Mã</th><th>Trưởng phòng</th><th>Số thành viên</th></tr>
              </thead>
              <tbody>
                {state.departments.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{d.code}</td>
                    <td>{d.managerName || "—"}</td>
                    <td>{state.users.filter((u) => u.orgUnitId === d.id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
