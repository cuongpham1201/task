# BHL Task — App Giao Việc Nội Bộ

Web app quản lý & giao việc nội bộ lấy cảm hứng UX từ Asana, đơn giản hóa cho doanh nghiệp/phòng ban. Phiên bản demo frontend hoàn chỉnh với mock data tiếng Việt — chưa có backend.

## Chạy dự án

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build production vào dist/
```

## Công nghệ

- **React 18 + Vite** — không TypeScript, giữ đơn giản cho MVP
- **React Router 6** — điều hướng SPA
- **lucide-react** — bộ icon
- **CSS thuần** ([src/styles.css](src/styles.css)) — design system biến CSS, không cần framework

## Cấu trúc thư mục

```
src/
├── data/
│   ├── constants.js      # Trạng thái, ưu tiên, section, vai trò
│   └── mock.js           # Mock data: 10 user, 4 phòng ban, 3 channel, 28 task
├── store/
│   └── AppContext.jsx    # State toàn app (useReducer) + selectors + actions
├── utils/
│   ├── date.js           # Xử lý ngày: quá hạn, hôm nay, nhãn hạn, time-ago
│   └── activity.js       # Diễn giải activity log thành câu tiếng Việt
├── components/
│   ├── layout/           # Sidebar, Topbar
│   ├── shared/           # Avatar, Dropdown, badges, ProgressBar, EmptyState
│   └── task/             # TaskTable, KanbanBoard, CalendarView,
│                         # TaskDetailPanel, CreateTaskModal
└── pages/                # Dashboard, MyTasks, Inbox, DepartmentPage,
                          # ChannelPage, Reports, Settings
```

## Tính năng hiện có (Phase 1 + 2)

- **Trang chủ** — lời chào, thống kê nhanh, việc của tôi (sắp đến hạn/quá hạn/hoàn thành), tổng quan phòng ban & channel
- **Việc của tôi** — bảng kiểu Asana, tabs lọc (Tất cả/Hôm nay/Sắp đến hạn/Quá hạn/Đã hoàn thành), tick hoàn thành, đổi trạng thái inline
- **Phòng ban** — 3 view: Danh sách (nhóm theo section), Bảng Kanban (kéo thả), Lịch tháng
- **Channel/Dự án** — danh sách + Kanban + feed hoạt động + placeholder tệp đính kèm, bộ lọc trạng thái/người phụ trách/hạn
- **Chi tiết task** — panel bên phải: sửa trạng thái, ưu tiên, người phụ trách, ngày, tiến độ %, mô tả, việc con, bình luận, activity log
- **Tạo công việc** — modal đầy đủ: loại Cá nhân/Phòng ban/Channel, section, người phối hợp, việc con
- **Thông báo** — inbox từ hoạt động trên task liên quan, đếm chưa đọc trên sidebar
- **Báo cáo** — filter phòng ban/nhân sự/thời gian, tỷ lệ hoàn thành theo phòng ban, bảng task quá hạn
- **Phân quyền cơ bản** — Admin xem tất cả, Trưởng phòng xem báo cáo phòng mình, Nhân viên chỉ xem việc của mình (đổi user demo trong Cài đặt)

## Ghi chú kỹ thuật

- **Mock data dùng ngày tương đối** (`daysFromNow(n)`) — mỗi lần chạy demo luôn có task quá hạn / đến hạn hôm nay.
- **State không lưu trữ** — reload trang sẽ reset về mock data. Khi làm backend, thay các action trong `AppContext.jsx` bằng gọi API là đủ (data model đã khớp thiết kế: Task, Subtask, Comment, Activity, User, Department, Channel).
- **Đổi người dùng demo** ở trang Cài đặt để thử phân quyền các role.

## Lộ trình (Phase 3)

- Backend thật + lưu trữ
- Quyền chi tiết theo hành động
- Đính kèm tệp
- Đăng nhập Microsoft 365, tích hợp Teams
