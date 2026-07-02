import { useApp } from '../store/AppContext'
import Avatar from '../components/shared/Avatar'
import { ROLES } from '../data/constants'

export default function Settings() {
  const { state, currentUser, usersById, setCurrentUser } = useApp()
  const isAdmin = currentUser.role === 'admin'
  const dept = state.departments.find((d) => d.id === currentUser.departmentId)

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
            <p className="muted">{dept?.name} · {ROLES[currentUser.role]}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Đổi người dùng (demo)</h2></div>
        <p className="muted settings-hint">
          Chuyển sang tài khoản khác để thử nghiệm phân quyền: Admin xem toàn bộ,
          Trưởng phòng xem báo cáo phòng mình, Nhân viên chỉ xem việc của mình.
        </p>
        <div className="settings-users">
          {state.users.map((u) => {
            const d = state.departments.find((x) => x.id === u.departmentId)
            return (
              <button
                key={u.id}
                className={`settings-user ${u.id === currentUser.id ? 'active' : ''}`}
                onClick={() => setCurrentUser(u.id)}
              >
                <Avatar user={u} size={30} />
                <span className="settings-user-info">
                  <span>{u.displayName}</span>
                  <span className="muted">{d?.name} · {ROLES[u.role]}</span>
                </span>
                {u.id === currentUser.id && <span className="badge status-done">Đang dùng</span>}
              </button>
            )
          })}
        </div>
      </div>

      {isAdmin && (
        <div className="card">
          <div className="card-head"><h2>Quản trị (Admin)</h2></div>
          <p className="muted settings-hint">
            Quản lý phòng ban và channel — bản demo hiển thị danh sách, chỉnh sửa sẽ có ở phiên bản sau.
          </p>
          <table className="task-table settings-table">
            <thead>
              <tr><th>Phòng ban</th><th>Mã</th><th>Trưởng phòng</th><th>Số thành viên</th></tr>
            </thead>
            <tbody>
              {state.departments.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.code}</td>
                  <td>{usersById[d.managerId]?.displayName}</td>
                  <td>{state.users.filter((u) => u.departmentId === d.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
