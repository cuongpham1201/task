import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

// Kiểu tối giản cho user hiện tại (từ DB) và task (từ DB) dùng trong kiểm quyền.
type Actor = { id: string; role: string; departmentId: string | null }
type TaskLike = {
  creatorId: string
  assigneeId: string
  scope: string
  departmentId: string | null
  projectId: string | null
}

/**
 * Ủy quyền server-side (port từ frontend permissions.js).
 * admin: toàn quyền · manager: quản lý việc phòng mình / mình tạo · member: việc của mình.
 * Reviewer nghiệm thu: admin / người giao (creator) / manager phòng liên quan.
 */
@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService) {}

  private isManagerOfDept(user: Actor, departmentId: string | null): boolean {
    return user.role === 'manager' && !!departmentId && user.departmentId === departmentId
  }

  private involved(user: Actor, task: TaskLike): boolean {
    return task.creatorId === user.id || task.assigneeId === user.id
  }

  /** Quản lý task (đổi assignee/deadline/ưu tiên/xóa): admin, người tạo, hoặc manager phòng. */
  canManage(user: Actor, task: TaskLike): boolean {
    return (
      user.role === 'admin' ||
      task.creatorId === user.id ||
      this.isManagerOfDept(user, task.departmentId)
    )
  }

  /** Cập nhật trạng thái/tiến độ: người quản lý + người được giao. */
  canUpdateStatus(user: Actor, task: TaskLike): boolean {
    return this.canManage(user, task) || task.assigneeId === user.id
  }

  /** Bình luận: admin, người liên quan, hoặc manager phòng. */
  canComment(user: Actor, task: TaskLike): boolean {
    return (
      user.role === 'admin' ||
      this.involved(user, task) ||
      this.isManagerOfDept(user, task.departmentId)
    )
  }

  /** Nghiệm thu: admin, người giao (creator), hoặc manager phòng liên quan. KHÔNG cho tự nghiệm thu việc mình làm trừ khi là creator/admin. */
  canReview(user: Actor, task: TaskLike): boolean {
    return (
      user.role === 'admin' ||
      task.creatorId === user.id ||
      this.isManagerOfDept(user, task.departmentId)
    )
  }

  /** Tạo task theo scope. */
  canCreate(user: Actor, scope: string, departmentId: string | null): boolean {
    if (user.role === 'admin') return true
    if (scope === 'personal') return true
    if (scope === 'department') {
      return this.isManagerOfDept(user, departmentId) || user.departmentId === departmentId
    }
    // project: cho phép mọi user nội bộ (thành viên project kiểm ở tầng cao hơn nếu cần)
    return true
  }

  /** Lấy task + kiểm tồn tại. */
  async getTaskOrThrow(taskId: string): Promise<any> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } })
    if (!task || task.archived) {
      throw new ForbiddenException('Không tìm thấy công việc')
    }
    return task
  }

  assert(cond: boolean, msg = 'Bạn không có quyền thực hiện thao tác này'): void {
    if (!cond) throw new ForbiddenException(msg)
  }
}
