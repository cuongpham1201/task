// Tiện ích xử lý ngày tháng cho toàn app.
// Mock data dùng ngày tương đối so với hôm nay để demo luôn có task quá hạn / đến hạn.

export function daysFromNow(n, hour = 17) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

export function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

export function diffDays(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86400000)
}

export function isOverdue(task) {
  if (!task.dueDate || task.status === 'done') return false
  return startOfDay(task.dueDate) < startOfDay(new Date())
}

export function isDueToday(task) {
  if (!task.dueDate || task.status === 'done') return false
  return isSameDay(task.dueDate, new Date())
}

// Sắp đến hạn: còn hạn trong vòng `days` ngày tới (kể cả hôm nay)
export function isUpcoming(task, days = 7) {
  if (!task.dueDate || task.status === 'done') return false
  const d = diffDays(new Date(), task.dueDate)
  return d >= 0 && d <= days
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const now = new Date()
  const opts = { day: 'numeric', month: 'short' }
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString('vi-VN', opts)
}

export function formatDateFull(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

// Chuỗi yyyy-MM-dd cho input[type=date]
export function toInputDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromInputDate(value) {
  if (!value) return null
  const d = new Date(`${value}T17:00:00`)
  return d.toISOString()
}

// Nhãn hạn hoàn thành kèm sắc thái màu
export function dueLabel(task) {
  if (!task.dueDate) return { text: 'Không có hạn', tone: 'muted' }
  const d = diffDays(new Date(), task.dueDate)
  if (task.status === 'done') return { text: formatDate(task.dueDate), tone: 'muted' }
  if (d < 0) return { text: `Quá hạn ${-d} ngày`, tone: 'overdue' }
  if (d === 0) return { text: 'Hôm nay', tone: 'today' }
  if (d === 1) return { text: 'Ngày mai', tone: 'soon' }
  if (d <= 7) return { text: formatDate(task.dueDate), tone: 'soon' }
  return { text: formatDate(task.dueDate), tone: 'normal' }
}

export function timeAgo(dateStr) {
  const s = Math.max(0, (Date.now() - new Date(dateStr).getTime()) / 1000)
  if (s < 60) return 'Vừa xong'
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} ngày trước`
  return formatDate(dateStr)
}

export function greetingByHour() {
  const h = new Date().getHours()
  if (h < 11) return 'Chào buổi sáng'
  if (h < 14) return 'Chào buổi trưa'
  if (h < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

export function todayLabel() {
  return new Date().toLocaleDateString('vi-VN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}
