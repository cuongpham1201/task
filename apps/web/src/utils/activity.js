import { STATUS, PRIORITY } from '../data/constants'
import { formatDateFull } from './date'

// Diễn giải một activity thành câu tiếng Việt
export function activityText(activity, usersById) {
  const meta = activity.metadata || {}
  switch (activity.action) {
    case 'create':
      return 'đã tạo công việc'
    case 'assign': {
      const from = usersById[meta.from]
      const to = usersById[meta.to]
      if (meta.from && from && meta.from !== meta.to) {
        return `đã chuyển người phụ trách từ ${from.displayName} sang ${to?.displayName || '—'}`
      }
      return `đã giao việc cho ${to?.displayName || '—'}`
    }
    case 'status':
      return `đã chuyển trạng thái sang “${STATUS[meta.to]?.label || meta.to}”`
    case 'due':
      return meta.to
        ? `đã đổi deadline sang ${formatDateFull(meta.to)}`
        : 'đã bỏ deadline'
    case 'priority':
      return `đã đổi độ ưu tiên sang “${PRIORITY[meta.to]?.label || meta.to}”`
    case 'progress':
      if (meta.worklog) {
        return meta.add != null
          ? `đã ghi nhật ký thực hiện (+${meta.add}% → ${meta.to}%)`
          : 'đã ghi nhật ký thực hiện'
      }
      return `đã cập nhật tiến độ lên ${meta.to}%`
    case 'comment':
      return 'đã bình luận'
    case 'complete':
      return 'đã hoàn thành công việc'
    case 'review':
      if (meta.to === 'submitted') return 'đã nộp nghiệm thu'
      if (meta.decision === 'passed') return 'đã nghiệm thu Đạt ✓'
      if (meta.decision === 'returned') return 'đã trả lại công việc'
      return 'đã cập nhật nghiệm thu'
    case 'edit': {
      const map = { title: 'tên', description: 'mô tả', section: 'nhóm', startDate: 'ngày bắt đầu' }
      const names = (meta.fields || []).map((f) => map[f] || f).join(', ')
      return names ? `đã sửa ${names}` : 'đã sửa thông tin công việc'
    }
    case 'subtask':
      if (meta.done === true) return `đã hoàn thành việc con “${meta.title || ''}”`
      if (meta.done === false) return `đã bỏ hoàn thành việc con “${meta.title || ''}”`
      return 'đã cập nhật việc con'
    default:
      return 'đã cập nhật công việc'
  }
}
