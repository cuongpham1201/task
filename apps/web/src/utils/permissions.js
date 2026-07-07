// Phân quyền client-side = CHỈ để ẩn/disable UI. Server (PolicyService) là nguồn
// enforce thật + đã scope visibility (departments/channels/tasks trả về đã lọc theo quyền).
// Vì vậy các hàm "visible*" chỉ trả về nguyên danh sách server đã lọc.
//
// user.orgUnitId = phòng/ban chính. task.departmentId (trong shape FE) = org_unit của
// workspace ORG_UNIT; task.channelId = id workspace PROJECT.

export function canManageTask(user, task) {
  if (!user) return false
  if (user.role === 'admin') return true
  if (task.creatorId === user.id) return true
  // Quản lý phòng: manager & task thuộc phòng mình (gợi ý UI; server kiểm chính xác theo org role)
  if (user.role === 'manager' && task.departmentId && task.departmentId === user.orgUnitId) return true
  return false
}

export function canUpdateStatus(user, task) {
  return task.assigneeId === user.id || canManageTask(user, task)
}

export function canWorkSubtasks(user, task) {
  return canUpdateStatus(user, task) || task.collaboratorIds.includes(user.id)
}

// Task đã được server scope → nếu thấy task nghĩa là được xem; cho phép comment.
export function canComment(user, task) {
  if (canWorkSubtasks(user, task)) return true
  return true
}

// input: { scope, departmentId, channelId }
export function canCreateTask(user, input, channels = []) {
  if (input.scope === 'channel') {
    if (user.role === 'admin') return true
    const channel = channels.find((c) => c.id === input.channelId)
    return !!channel?.members.includes(user.id)
  }
  // personal & department: server kiểm (thuộc phòng / quản lý phòng); FE cho hiển thị
  return true
}

export function canCreateDeptTask(user, departmentId, visibleDepartments = []) {
  if (user.role === 'admin') return true
  // Được tạo nếu là phòng mình hoặc phòng nằm trong phạm vi quản lý (đang thấy)
  return user.orgUnitId === departmentId || visibleDepartments.some((d) => d.id === departmentId)
}

export function canCreateChannelTask(user, channel) {
  return user.role === 'admin' || channel.members.includes(user.id)
}

// Server ĐÃ scope → trả nguyên danh sách nhận được.
export function visibleDepartmentsFor(_user, departments) {
  return departments
}

export function visibleChannelsFor(_user, channels) {
  return channels
}
