// Ma trận phân quyền client-side (tạm thời cho demo).
// Phase 3: các rule này PHẢI được kiểm tra lại ở server — client chỉ ẩn/disable UI.
//
// Rule:
// - Admin: toàn quyền
// - Creator: quản lý task mình tạo
// - Manager: quản lý task thuộc phòng ban mình
// - Assignee: cập nhật trạng thái / tiến độ / mô tả / subtask / comment
// - Collaborator: cập nhật subtask + comment
// - Thành viên channel: comment trong task của channel
// - Member thường: không đụng được task không liên quan

export function canManageTask(user, task) {
  if (user.role === 'admin') return true
  if (task.creatorId === user.id) return true
  if (user.role === 'manager' && task.departmentId && task.departmentId === user.departmentId) {
    return true
  }
  return false
}

export function canUpdateStatus(user, task) {
  return task.assigneeId === user.id || canManageTask(user, task)
}

export function canWorkSubtasks(user, task) {
  return canUpdateStatus(user, task) || task.collaboratorIds.includes(user.id)
}

export function canComment(user, task, channels = []) {
  if (canWorkSubtasks(user, task)) return true
  if (task.channelId) {
    const channel = channels.find((c) => c.id === task.channelId)
    return !!channel?.members.includes(user.id)
  }
  return false
}

// input: { scope, departmentId, channelId }
export function canCreateTask(user, input, channels = []) {
  if (input.scope === 'department') {
    return user.role === 'admin' ||
      (user.role === 'manager' && input.departmentId === user.departmentId)
  }
  if (input.scope === 'channel') {
    if (user.role === 'admin') return true
    const channel = channels.find((c) => c.id === input.channelId)
    return !!channel?.members.includes(user.id)
  }
  return true // personal: ai cũng tạo được
}

export function canCreateDeptTask(user, departmentId) {
  return user.role === 'admin' ||
    (user.role === 'manager' && user.departmentId === departmentId)
}

export function canCreateChannelTask(user, channel) {
  return user.role === 'admin' || channel.members.includes(user.id)
}

// Sidebar / Dashboard: member & manager chỉ thấy phòng ban / channel liên quan
export function visibleDepartmentsFor(user, departments) {
  if (user.role === 'admin') return departments
  return departments.filter((d) => d.id === user.departmentId)
}

export function visibleChannelsFor(user, channels) {
  if (user.role === 'admin') return channels
  return channels.filter((c) => c.members.includes(user.id))
}
