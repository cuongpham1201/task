// Các hằng số dùng chung: trạng thái, ưu tiên, section, vai trò

export const STATUS = {
  todo: { label: 'Chưa bắt đầu' },
  doing: { label: 'Đang làm' },
  waiting: { label: 'Chờ phản hồi' },
  submitted: { label: 'Chờ nghiệm thu' }, // chỉ hiển thị — vào bằng nút "Nộp nghiệm thu"
  returned: { label: 'Bị trả lại' },      // chỉ hiển thị — do người nghiệm thu trả lại
  done: { label: 'Hoàn thành' },
  paused: { label: 'Tạm dừng' },
}
// Trạng thái chọn tay (submitted/returned đi qua luồng nghiệm thu, không chọn trực tiếp)
export const STATUS_ORDER = ['todo', 'doing', 'waiting', 'done', 'paused']
export const KANBAN_COLUMNS = ['todo', 'doing', 'waiting', 'done']

export const PRIORITY = {
  low: { label: 'Thấp' },
  normal: { label: 'Bình thường' },
  high: { label: 'Cao' },
  urgent: { label: 'Khẩn cấp' },
}
export const PRIORITY_ORDER = ['low', 'normal', 'high', 'urgent']

export const SECTIONS = {
  suvu: 'Công việc sự vụ',
  kehoach: 'Công việc kế hoạch',
  hangngay: 'Công việc hằng ngày',
  phatsinh: 'Công việc phát sinh',
}
export const SECTION_ORDER = ['suvu', 'kehoach', 'hangngay', 'phatsinh']

export const ROLES = {
  admin: 'Admin',
  manager: 'Trưởng phòng',
  member: 'Nhân viên',
}

export const SCOPES = {
  personal: 'Cá nhân',
  department: 'Phòng ban',
  channel: 'Dự án', // key nội bộ giữ 'channel' (API map → project), nhãn hiển thị = Dự án
}
