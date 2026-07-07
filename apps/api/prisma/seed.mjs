// Seed từ mock data của frontend (apps/web/src/data/mock.js)
// Ngày tháng tính tương đối so với ngày chạy seed — demo luôn có task quá hạn / đến hạn.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Timestamp tương đối (giờ local)
const ts = (offsetDays, hour = 9) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setHours(hour, 0, 0, 0)
  return d
}
// Cột date-only (start_date/due_date): chốt theo ngày lịch địa phương, lưu UTC-midnight
// để tránh lệch ngày khi Prisma serialize @db.Date
const day = (offsetDays) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

const users = [
  { id: 'u1', displayName: 'Phạm Xuân Cường', email: 'cuongpx@biahalong.com', departmentId: 'd4', role: 'admin' },
  { id: 'u2', displayName: 'Nguyễn Văn An', email: 'annv@biahalong.com', departmentId: 'd1', role: 'manager' },
  { id: 'u3', displayName: 'Trần Thị Bình', email: 'binhtt@biahalong.com', departmentId: 'd2', role: 'manager' },
  { id: 'u4', displayName: 'Lê Minh Châu', email: 'chaulm@biahalong.com', departmentId: 'd3', role: 'manager' },
  { id: 'u5', displayName: 'Hoàng Đức Dũng', email: 'dunghd@biahalong.com', departmentId: 'd4', role: 'manager' },
  { id: 'u6', displayName: 'Vũ Thị Em', email: 'emvt@biahalong.com', departmentId: 'd1', role: 'member' },
  { id: 'u7', displayName: 'Đỗ Quang Huy', email: 'huydq@biahalong.com', departmentId: 'd2', role: 'member' },
  { id: 'u8', displayName: 'Bùi Thu Hà', email: 'habt@biahalong.com', departmentId: 'd3', role: 'member' },
  { id: 'u9', displayName: 'Ngô Văn Khoa', email: 'khoanv@biahalong.com', departmentId: 'd4', role: 'member' },
  { id: 'u10', displayName: 'Phan Thị Lan', email: 'lanpt@biahalong.com', departmentId: 'd2', role: 'member' },
]

const departments = [
  { id: 'd1', name: 'Ban Pháp chế', code: 'PC', color: '#b478e8', managerId: 'u2' },
  { id: 'd2', name: 'Phòng Kế toán', code: 'KT', color: '#4f9cf0', managerId: 'u3' },
  { id: 'd3', name: 'Phòng Nhân sự', code: 'NS', color: '#ec6f9e', managerId: 'u4' },
  { id: 'd4', name: 'Ban Tài chính & Quản trị', code: 'TCQT', color: '#2fbf9a', managerId: 'u5' },
]

const projects = [
  { id: 'p1', name: 'Quy trình phê duyệt', description: 'Chuẩn hóa quy trình phê duyệt liên phòng ban', ownerId: 'u5', members: ['u1', 'u2', 'u3', 'u5'] },
  { id: 'p2', name: 'Triển khai ứng dụng nội bộ', description: 'Triển khai app Giao việc và các ứng dụng nội bộ khác', ownerId: 'u1', members: ['u1', 'u4', 'u7', 'u9'] },
  { id: 'p3', name: 'Audit nội bộ', description: 'Kiểm toán nội bộ định kỳ quý II/2026', ownerId: 'u5', members: ['u1', 'u3', 'u5', 'u6', 'u10'] },
]

const T = (id, over) => ({
  id: `t${id}`,
  description: '',
  scope: 'department',
  departmentId: null,
  projectId: null,
  section: 'suvu',
  creatorId: 'u2',
  assigneeId: 'u1',
  collaboratorIds: [],
  status: 'todo',
  priority: 'normal',
  startDate: null,
  dueDate: null,
  progress: 0,
  createdAt: ts(-10, 9),
  completedAt: null,
  ...over,
})

const tasks = [
  // ── Ban Pháp chế (d1)
  T(1, {
    title: 'Rà soát hợp đồng phân phối khu vực miền Bắc',
    description: 'Rà soát toàn bộ điều khoản hợp đồng với các nhà phân phối khu vực miền Bắc, tập trung vào điều khoản thanh toán và chấm dứt hợp đồng.',
    departmentId: 'd1', section: 'suvu', creatorId: 'u2', assigneeId: 'u6',
    status: 'doing', priority: 'high', startDate: day(-5), dueDate: day(2), progress: 60,
  }),
  T(2, {
    title: 'Cập nhật quy chế quản lý hợp đồng nội bộ',
    departmentId: 'd1', section: 'kehoach', creatorId: 'u2', assigneeId: 'u6', collaboratorIds: ['u2'],
    status: 'waiting', priority: 'normal', dueDate: day(7), progress: 40,
  }),
  T(3, {
    title: 'Tư vấn pháp lý vụ tranh chấp với nhà cung cấp vỏ lon',
    description: 'Chuẩn bị hồ sơ pháp lý và phương án đàm phán cho vụ tranh chấp hợp đồng cung cấp vỏ lon.',
    departmentId: 'd1', section: 'suvu', creatorId: 'u2', assigneeId: 'u6',
    status: 'doing', priority: 'urgent', dueDate: day(-2), progress: 50,
  }),
  T(4, {
    title: 'Đăng ký nhãn hiệu cho dòng sản phẩm mới',
    departmentId: 'd1', section: 'kehoach', creatorId: 'u2', assigneeId: 'u6',
    status: 'todo', priority: 'normal', dueDate: day(14),
  }),
  T(5, {
    title: 'Báo cáo tuân thủ pháp luật quý II/2026',
    departmentId: 'd1', section: 'kehoach', creatorId: 'u2', assigneeId: 'u2',
    status: 'done', priority: 'high', dueDate: day(-3), progress: 100, completedAt: ts(-3, 16),
  }),

  // ── Phòng Kế toán (d2)
  T(6, {
    title: 'Đối chiếu công nợ nhà phân phối tháng 6',
    departmentId: 'd2', section: 'hangngay', creatorId: 'u3', assigneeId: 'u7',
    status: 'doing', priority: 'high', dueDate: day(0), progress: 70,
  }),
  T(7, {
    title: 'Lập báo cáo tài chính quý II/2026',
    description: 'Tổng hợp số liệu, lập bảng cân đối kế toán, báo cáo kết quả kinh doanh và lưu chuyển tiền tệ quý II.',
    departmentId: 'd2', section: 'kehoach', creatorId: 'u3', assigneeId: 'u7', collaboratorIds: ['u10'],
    status: 'doing', priority: 'urgent', startDate: day(-7), dueDate: day(4), progress: 30,
  }),
  T(8, {
    title: 'Hoàn thiện hồ sơ quyết toán thuế năm 2025',
    departmentId: 'd2', section: 'suvu', creatorId: 'u3', assigneeId: 'u10',
    status: 'waiting', priority: 'high', dueDate: day(-5), progress: 80,
  }),
  T(9, {
    title: 'Cập nhật bảng giá vốn cho sản phẩm mới',
    departmentId: 'd2', section: 'phatsinh', creatorId: 'u3', assigneeId: 'u10',
    status: 'todo', priority: 'normal', dueDate: day(6),
  }),
  T(10, {
    title: 'Thanh toán chi phí vận chuyển tháng 6',
    departmentId: 'd2', section: 'hangngay', creatorId: 'u3', assigneeId: 'u10',
    status: 'done', priority: 'normal', dueDate: day(-1), progress: 100, completedAt: ts(-1, 15),
  }),

  // ── Phòng Nhân sự (d3)
  T(11, {
    title: 'Tuyển dụng nhân viên kinh doanh khu vực Quảng Ninh',
    description: 'Tuyển 3 nhân viên kinh doanh phụ trách kênh nhà hàng, quán bia khu vực Hạ Long - Cẩm Phả.',
    departmentId: 'd3', section: 'kehoach', creatorId: 'u4', assigneeId: 'u8',
    status: 'doing', priority: 'high', startDate: day(-10), dueDate: day(5), progress: 45,
  }),
  T(12, {
    title: 'Tổ chức khám sức khỏe định kỳ năm 2026',
    departmentId: 'd3', section: 'kehoach', creatorId: 'u4', assigneeId: 'u8',
    status: 'todo', priority: 'normal', dueDate: day(20),
  }),
  T(13, {
    title: 'Chấm công và tính lương tháng 6',
    departmentId: 'd3', section: 'hangngay', creatorId: 'u4', assigneeId: 'u8',
    status: 'doing', priority: 'urgent', dueDate: day(1), progress: 55,
  }),
  T(14, {
    title: 'Xử lý hồ sơ nghỉ việc nhân viên kho',
    departmentId: 'd3', section: 'phatsinh', creatorId: 'u4', assigneeId: 'u8',
    status: 'done', priority: 'normal', dueDate: day(-2), progress: 100, completedAt: ts(-2, 11),
  }),
  T(15, {
    title: 'Rà soát và cập nhật nội quy lao động',
    departmentId: 'd3', section: 'suvu', creatorId: 'u4', assigneeId: 'u4',
    status: 'paused', priority: 'low', dueDate: day(30), progress: 20,
  }),

  // ── Ban Tài chính & Quản trị (d4)
  T(16, {
    title: 'Xây dựng kế hoạch ngân sách 6 tháng cuối năm 2026',
    description: 'Lập kế hoạch ngân sách chi tiết cho từng phòng ban 6 tháng cuối năm, trình Ban Giám đốc phê duyệt trước ngày 15/7.',
    departmentId: 'd4', section: 'kehoach', creatorId: 'u5', assigneeId: 'u1', collaboratorIds: ['u3', 'u9'],
    status: 'doing', priority: 'urgent', startDate: day(-6), dueDate: day(3), progress: 40,
    completionMode: 'review_required',
  }),
  T(17, {
    title: 'Rà soát định mức chi phí các phòng ban',
    description: 'Đối chiếu định mức chi phí hiện hành với số liệu thực tế 6 tháng đầu năm, đề xuất điều chỉnh.',
    departmentId: 'd4', section: 'suvu', creatorId: 'u5', assigneeId: 'u1',
    status: 'waiting', priority: 'high', dueDate: day(-1), progress: 65,
  }),
  T(18, {
    title: 'Tổng hợp báo cáo quản trị tháng 6',
    departmentId: 'd4', section: 'hangngay', creatorId: 'u5', assigneeId: 'u9', collaboratorIds: ['u1'],
    status: 'doing', priority: 'high', dueDate: day(0), progress: 50,
  }),
  T(19, {
    title: 'Đánh giá hiệu quả đầu tư dây chuyền chiết lon mới',
    departmentId: 'd4', section: 'kehoach', creatorId: 'u5', assigneeId: 'u1',
    status: 'todo', priority: 'normal', dueDate: day(10),
  }),
  T(20, {
    title: 'Cập nhật dashboard chi phí vận hành',
    departmentId: 'd4', section: 'phatsinh', creatorId: 'u5', assigneeId: 'u9',
    status: 'done', priority: 'normal', dueDate: day(-4), progress: 100, completedAt: ts(-4, 17),
  }),

  // ── Projects
  T(21, {
    title: 'Chuẩn hóa quy trình phê duyệt thanh toán',
    description: 'Thống nhất luồng phê duyệt thanh toán 3 cấp: người đề nghị → trưởng phòng → tài chính. Áp dụng từ tháng 8/2026.',
    scope: 'project', departmentId: null, projectId: 'p1', section: null,
    creatorId: 'u5', assigneeId: 'u1', collaboratorIds: ['u2', 'u3'],
    status: 'doing', priority: 'high', startDate: day(-8), dueDate: day(5), progress: 35,
    completionMode: 'review_required',
  }),
  T(22, {
    title: 'Soạn thảo mẫu tờ trình phê duyệt chung',
    scope: 'project', departmentId: null, projectId: 'p1', section: null,
    creatorId: 'u5', assigneeId: 'u2',
    status: 'todo', priority: 'normal', dueDate: day(8),
  }),
  T(23, {
    title: 'Pilot app Giao việc tại Phòng Kế toán',
    description: 'Chạy thử nghiệm ứng dụng giao việc trong 2 tuần tại Phòng Kế toán, thu thập phản hồi người dùng.',
    scope: 'project', departmentId: null, projectId: 'p2', section: null,
    creatorId: 'u1', assigneeId: 'u7', collaboratorIds: ['u9'],
    status: 'doing', priority: 'high', startDate: day(-4), dueDate: day(6), progress: 25,
  }),
  T(24, {
    title: 'Đào tạo sử dụng hệ thống giao việc cho các phòng ban',
    scope: 'project', departmentId: null, projectId: 'p2', section: null,
    creatorId: 'u1', assigneeId: 'u4',
    status: 'todo', priority: 'normal', dueDate: day(12),
  }),
  T(25, {
    title: 'Kiểm tra chứng từ chi phí quý II',
    scope: 'project', departmentId: null, projectId: 'p3', section: null,
    creatorId: 'u3', assigneeId: 'u10', collaboratorIds: ['u6'],
    status: 'doing', priority: 'high', dueDate: day(-1), progress: 60,
  }),
  T(26, {
    title: 'Tổng hợp phát hiện audit và khuyến nghị',
    scope: 'project', departmentId: null, projectId: 'p3', section: null,
    creatorId: 'u5', assigneeId: 'u1',
    status: 'todo', priority: 'high', dueDate: day(9),
  }),

  // ── Cá nhân
  T(27, {
    title: 'Chuẩn bị nội dung họp giao ban tuần',
    scope: 'personal', departmentId: null, section: null,
    creatorId: 'u1', assigneeId: 'u1',
    status: 'todo', priority: 'normal', dueDate: day(0),
  }),
  T(28, {
    title: 'Đọc quy định mới về hóa đơn điện tử',
    scope: 'personal', departmentId: null, section: null,
    creatorId: 'u1', assigneeId: 'u1',
    status: 'done', priority: 'low', dueDate: day(-6), progress: 100, completedAt: ts(-6, 20),
  }),
]

const subtasks = [
  { id: 's1', taskId: 't1', title: 'Tập hợp danh sách hợp đồng còn hiệu lực', done: true, assigneeId: 'u6' },
  { id: 's2', taskId: 't1', title: 'Rà soát điều khoản thanh toán', done: true, assigneeId: 'u6' },
  { id: 's3', taskId: 't1', title: 'Lập báo cáo rủi ro và đề xuất sửa đổi', done: false, assigneeId: 'u6' },
  { id: 's4', taskId: 't7', title: 'Chốt số liệu doanh thu từ phòng kinh doanh', done: true, assigneeId: 'u7' },
  { id: 's5', taskId: 't7', title: 'Lập bảng cân đối kế toán', done: false, assigneeId: 'u7' },
  { id: 's6', taskId: 't7', title: 'Lập báo cáo lưu chuyển tiền tệ', done: false, assigneeId: 'u10' },
  { id: 's7', taskId: 't11', title: 'Đăng tin tuyển dụng', done: true, assigneeId: 'u8' },
  { id: 's8', taskId: 't11', title: 'Sàng lọc hồ sơ ứng viên', done: true, assigneeId: 'u8' },
  { id: 's9', taskId: 't11', title: 'Phỏng vấn vòng 1', done: false, assigneeId: 'u8' },
  { id: 's10', taskId: 't16', title: 'Thu thập số liệu chi phí 6 tháng đầu năm', done: true, assigneeId: 'u9' },
  { id: 's11', taskId: 't16', title: 'Dự thảo phân bổ ngân sách theo phòng ban', done: false, assigneeId: 'u1' },
  { id: 's12', taskId: 't16', title: 'Họp thống nhất với các trưởng phòng', done: false, assigneeId: 'u1' },
  { id: 's13', taskId: 't16', title: 'Trình Ban Giám đốc phê duyệt', done: false, assigneeId: 'u5' },
  { id: 's14', taskId: 't21', title: 'Khảo sát luồng phê duyệt hiện tại của các phòng', done: true, assigneeId: 'u1' },
  { id: 's15', taskId: 't21', title: 'Vẽ sơ đồ quy trình chuẩn', done: false, assigneeId: 'u1' },
  { id: 's16', taskId: 't21', title: 'Lấy ý kiến Ban Pháp chế', done: false, assigneeId: 'u2' },
  { id: 's17', taskId: 't23', title: 'Tạo tài khoản cho nhân sự Phòng Kế toán', done: true, assigneeId: 'u9' },
  { id: 's18', taskId: 't23', title: 'Hướng dẫn sử dụng buổi đầu', done: false, assigneeId: 'u7' },
]

const comments = [
  { id: 'cm1', taskId: 't16', userId: 'u5', content: 'Anh Cường lưu ý deadline trình BGĐ là 15/7, cố gắng chốt dự thảo trước 10/7 nhé.', createdAt: ts(-3, 9) },
  { id: 'cm2', taskId: 't16', userId: 'u1', content: 'Vâng anh. Em đã nhận đủ số liệu từ chị Bình, đang lên dự thảo phân bổ.', createdAt: ts(-3, 10) },
  { id: 'cm3', taskId: 't16', userId: 'u3', content: 'Số liệu chi phí bên Kế toán đã gửi qua email, anh Cường kiểm tra giúp em.', createdAt: ts(-1, 14) },
  { id: 'cm4', taskId: 't17', userId: 'u5', content: 'Phần định mức văn phòng phẩm cần đối chiếu thêm với thực tế quý II.', createdAt: ts(-2, 15) },
  { id: 'cm5', taskId: 't21', userId: 'u2', content: 'Bên Pháp chế góp ý: cần bổ sung bước lưu hồ sơ phê duyệt tối thiểu 5 năm theo quy định.', createdAt: ts(-1, 10) },
  { id: 'cm6', taskId: 't1', userId: 'u2', content: 'Em ưu tiên nhóm hợp đồng sắp hết hạn trong quý III trước nhé.', createdAt: ts(-4, 8) },
  { id: 'cm7', taskId: 't1', userId: 'u6', content: 'Dạ vâng, em đã rà xong 12/20 hợp đồng, cuối tuần gửi báo cáo sơ bộ.', createdAt: ts(-2, 16) },
  { id: 'cm8', taskId: 't8', userId: 'u3', content: 'Hồ sơ đang chờ phản hồi từ Chi cục Thuế, dự kiến tuần sau có kết quả.', createdAt: ts(-2, 9) },
  { id: 'cm9', taskId: 't23', userId: 'u7', content: 'Anh em Kế toán phản hồi app dễ dùng, đề xuất thêm tính năng nhắc hạn qua email.', createdAt: ts(0, 8) },
]

const activities = [
  { taskId: 't16', userId: 'u5', action: 'create', metadata: {}, createdAt: ts(-6, 8) },
  { taskId: 't16', userId: 'u5', action: 'assign', metadata: { to: 'u1' }, createdAt: ts(-6, 8) },
  { taskId: 't16', userId: 'u1', action: 'status', metadata: { from: 'todo', to: 'doing' }, createdAt: ts(-5, 9) },
  { taskId: 't16', userId: 'u5', action: 'comment', metadata: {}, createdAt: ts(-3, 9) },
  { taskId: 't16', userId: 'u3', action: 'comment', metadata: {}, createdAt: ts(-1, 14) },
  { taskId: 't17', userId: 'u5', action: 'create', metadata: {}, createdAt: ts(-9, 10) },
  { taskId: 't17', userId: 'u1', action: 'status', metadata: { from: 'doing', to: 'waiting' }, createdAt: ts(-2, 11) },
  { taskId: 't17', userId: 'u5', action: 'comment', metadata: {}, createdAt: ts(-2, 15) },
  { taskId: 't21', userId: 'u5', action: 'create', metadata: {}, createdAt: ts(-8, 9) },
  { taskId: 't21', userId: 'u2', action: 'comment', metadata: {}, createdAt: ts(-1, 10) },
  { taskId: 't1', userId: 'u2', action: 'create', metadata: {}, createdAt: ts(-5, 8) },
  { taskId: 't1', userId: 'u6', action: 'progress', metadata: { to: 60 }, createdAt: ts(-2, 16) },
  { taskId: 't23', userId: 'u1', action: 'create', metadata: {}, createdAt: ts(-4, 9) },
  { taskId: 't23', userId: 'u7', action: 'comment', metadata: {}, createdAt: ts(0, 8) },
  { taskId: 't18', userId: 'u9', action: 'progress', metadata: { to: 50 }, createdAt: ts(0, 9) },
  { taskId: 't5', userId: 'u2', action: 'complete', metadata: {}, createdAt: ts(-3, 16) },
  { taskId: 't26', userId: 'u5', action: 'create', metadata: {}, createdAt: ts(-1, 16) },
  { taskId: 't26', userId: 'u5', action: 'assign', metadata: { to: 'u1' }, createdAt: ts(-1, 16) },
]

async function main() {
  // Xóa theo thứ tự FK để seed idempotent
  await prisma.syncLog.deleteMany()
  await prisma.taskKpiResult.deleteMany()
  await prisma.externalUserMapping.deleteMany()
  await prisma.externalDepartmentMapping.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.activity.deleteMany()
  await prisma.comment.deleteMany()
  await prisma.subtask.deleteMany()
  await prisma.attachment.deleteMany()
  await prisma.taskReview.deleteMany()
  await prisma.taskCollaborator.deleteMany()
  await prisma.taskWatcher.deleteMany()
  await prisma.task.deleteMany()
  await prisma.projectMember.deleteMany()
  await prisma.project.deleteMany()
  await prisma.user.deleteMany()
  await prisma.department.deleteMany()

  // Departments (chưa gán manager vì FK vòng với users)
  await prisma.department.createMany({
    data: departments.map(({ managerId, ...d }) => d),
  })
  await prisma.user.createMany({ data: users })
  for (const d of departments) {
    await prisma.department.update({ where: { id: d.id }, data: { managerId: d.managerId } })
  }

  await prisma.project.createMany({
    data: projects.map(({ members, ...p }) => p),
  })
  await prisma.projectMember.createMany({
    data: projects.flatMap((p) => p.members.map((userId) => ({ projectId: p.id, userId }))),
  })

  await prisma.task.createMany({
    data: tasks.map(({ collaboratorIds, ...t }) => t),
  })
  await prisma.taskCollaborator.createMany({
    data: tasks.flatMap((t) => t.collaboratorIds.map((userId) => ({ taskId: t.id, userId }))),
  })

  await prisma.subtask.createMany({ data: subtasks })
  await prisma.comment.createMany({ data: comments })
  await prisma.activity.createMany({ data: activities })

  const counts = {
    users: await prisma.user.count(),
    departments: await prisma.department.count(),
    projects: await prisma.project.count(),
    tasks: await prisma.task.count(),
    subtasks: await prisma.subtask.count(),
    comments: await prisma.comment.count(),
    activities: await prisma.activity.count(),
  }
  console.log('Seed xong:', counts)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
