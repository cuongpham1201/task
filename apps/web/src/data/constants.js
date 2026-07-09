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

// ── Action Log (freeze) ──
export const ACTION_STATUS = {
  draft: { label: 'Nháp', tone: 'gray' },
  in_progress: { label: 'Đang thực hiện', tone: 'blue' },
  on_hold: { label: 'Tạm dừng', tone: 'amber' },
  at_risk: { label: 'Rủi ro', tone: 'red' },
  done: { label: 'Hoàn thành', tone: 'green' },
  cancelled: { label: 'Đã hủy', tone: 'gray' },
}
export const ACTION_STATUS_ORDER = ['draft', 'in_progress', 'on_hold', 'at_risk', 'done', 'cancelled']

export const ACTION_UPDATE_TYPE = {
  progress: { label: 'Tiến độ', tone: 'blue' },
  issue: { label: 'Khó khăn', tone: 'amber' },
  risk: { label: 'Rủi ro', tone: 'red' },
  recommendation: { label: 'Kiến nghị', tone: 'purple' },
  decision: { label: 'Quyết định', tone: 'green' },
  result: { label: 'Kết quả', tone: 'green' },
  note: { label: 'Ghi chú', tone: 'gray' },
}
export const ACTION_UPDATE_TYPE_ORDER = ['progress', 'issue', 'risk', 'recommendation', 'decision', 'result', 'note']
