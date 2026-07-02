import { STATUS } from '../data/constants'

// Diễn giải một activity thành câu tiếng Việt
export function activityText(activity, usersById) {
  const meta = activity.metadata || {}
  switch (activity.action) {
    case 'create':
      return 'đã tạo công việc'
    case 'assign': {
      const to = usersById[meta.to]
      return `đã giao việc cho ${to ? to.displayName : '—'}`
    }
    case 'status':
      return `đã chuyển trạng thái sang “${STATUS[meta.to]?.label || meta.to}”`
    case 'progress':
      return `đã cập nhật tiến độ lên ${meta.to}%`
    case 'comment':
      return 'đã bình luận'
    case 'complete':
      return 'đã hoàn thành công việc'
    default:
      return 'đã cập nhật công việc'
  }
}
