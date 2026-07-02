// Mock data demo — ngày tháng tính tương đối so với hôm nay
// để luôn có task quá hạn / đến hạn hôm nay / sắp đến hạn khi chạy demo.
import { daysFromNow } from '../utils/date'

export const CURRENT_USER_ID = 'u1'

export const users = [
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

export const departments = [
  { id: 'd1', name: 'Ban Pháp chế', code: 'PC', managerId: 'u2' },
  { id: 'd2', name: 'Phòng Kế toán', code: 'KT', managerId: 'u3' },
  { id: 'd3', name: 'Phòng Nhân sự', code: 'NS', managerId: 'u4' },
  { id: 'd4', name: 'Ban Tài chính & Quản trị', code: 'TCQT', managerId: 'u5' },
]

export const channels = [
  { id: 'c1', name: 'Quy trình phê duyệt', description: 'Chuẩn hóa quy trình phê duyệt liên phòng ban', members: ['u1', 'u2', 'u3', 'u5'] },
  { id: 'c2', name: 'Triển khai ứng dụng nội bộ', description: 'Triển khai app Giao việc và các ứng dụng nội bộ khác', members: ['u1', 'u4', 'u7', 'u9'] },
  { id: 'c3', name: 'Audit nội bộ', description: 'Kiểm toán nội bộ định kỳ quý II/2026', members: ['u1', 'u3', 'u5', 'u6', 'u10'] },
]

// Factory tạo task với giá trị mặc định
const T = (id, over) => ({
  id: `t${id}`,
  title: '',
  description: '',
  scope: 'department',
  departmentId: null,
  channelId: null,
  section: 'suvu',
  creatorId: 'u2',
  assigneeId: 'u1',
  collaboratorIds: [],
  status: 'todo',
  priority: 'normal',
  startDate: null,
  dueDate: null,
  progress: 0,
  createdAt: daysFromNow(-10, 9),
  updatedAt: daysFromNow(-1, 14),
  completedAt: null,
  ...over,
})

export const tasks = [
  // ── Ban Pháp chế (d1)
  T(1, {
    title: 'Rà soát hợp đồng phân phối khu vực miền Bắc',
    description: 'Rà soát toàn bộ điều khoản hợp đồng với các nhà phân phối khu vực miền Bắc, tập trung vào điều khoản thanh toán và chấm dứt hợp đồng.',
    departmentId: 'd1', section: 'suvu', creatorId: 'u2', assigneeId: 'u6',
    status: 'doing', priority: 'high', startDate: daysFromNow(-5), dueDate: daysFromNow(2), progress: 60,
  }),
  T(2, {
    title: 'Cập nhật quy chế quản lý hợp đồng nội bộ',
    departmentId: 'd1', section: 'kehoach', creatorId: 'u2', assigneeId: 'u6', collaboratorIds: ['u2'],
    status: 'waiting', priority: 'normal', dueDate: daysFromNow(7), progress: 40,
  }),
  T(3, {
    title: 'Tư vấn pháp lý vụ tranh chấp với nhà cung cấp vỏ lon',
    description: 'Chuẩn bị hồ sơ pháp lý và phương án đàm phán cho vụ tranh chấp hợp đồng cung cấp vỏ lon.',
    departmentId: 'd1', section: 'suvu', creatorId: 'u2', assigneeId: 'u6',
    status: 'doing', priority: 'urgent', dueDate: daysFromNow(-2), progress: 50,
  }),
  T(4, {
    title: 'Đăng ký nhãn hiệu cho dòng sản phẩm mới',
    departmentId: 'd1', section: 'kehoach', creatorId: 'u2', assigneeId: 'u6',
    status: 'todo', priority: 'normal', dueDate: daysFromNow(14),
  }),
  T(5, {
    title: 'Báo cáo tuân thủ pháp luật quý II/2026',
    departmentId: 'd1', section: 'kehoach', creatorId: 'u2', assigneeId: 'u2',
    status: 'done', priority: 'high', dueDate: daysFromNow(-3), progress: 100,
    completedAt: daysFromNow(-3, 16),
  }),

  // ── Phòng Kế toán (d2)
  T(6, {
    title: 'Đối chiếu công nợ nhà phân phối tháng 6',
    departmentId: 'd2', section: 'hangngay', creatorId: 'u3', assigneeId: 'u7',
    status: 'doing', priority: 'high', dueDate: daysFromNow(0), progress: 70,
  }),
  T(7, {
    title: 'Lập báo cáo tài chính quý II/2026',
    description: 'Tổng hợp số liệu, lập bảng cân đối kế toán, báo cáo kết quả kinh doanh và lưu chuyển tiền tệ quý II.',
    departmentId: 'd2', section: 'kehoach', creatorId: 'u3', assigneeId: 'u7', collaboratorIds: ['u10'],
    status: 'doing', priority: 'urgent', startDate: daysFromNow(-7), dueDate: daysFromNow(4), progress: 30,
  }),
  T(8, {
    title: 'Hoàn thiện hồ sơ quyết toán thuế năm 2025',
    departmentId: 'd2', section: 'suvu', creatorId: 'u3', assigneeId: 'u10',
    status: 'waiting', priority: 'high', dueDate: daysFromNow(-5), progress: 80,
  }),
  T(9, {
    title: 'Cập nhật bảng giá vốn cho sản phẩm mới',
    departmentId: 'd2', section: 'phatsinh', creatorId: 'u3', assigneeId: 'u10',
    status: 'todo', priority: 'normal', dueDate: daysFromNow(6),
  }),
  T(10, {
    title: 'Thanh toán chi phí vận chuyển tháng 6',
    departmentId: 'd2', section: 'hangngay', creatorId: 'u3', assigneeId: 'u10',
    status: 'done', priority: 'normal', dueDate: daysFromNow(-1), progress: 100,
    completedAt: daysFromNow(-1, 15),
  }),

  // ── Phòng Nhân sự (d3)
  T(11, {
    title: 'Tuyển dụng nhân viên kinh doanh khu vực Quảng Ninh',
    description: 'Tuyển 3 nhân viên kinh doanh phụ trách kênh nhà hàng, quán bia khu vực Hạ Long - Cẩm Phả.',
    departmentId: 'd3', section: 'kehoach', creatorId: 'u4', assigneeId: 'u8',
    status: 'doing', priority: 'high', startDate: daysFromNow(-10), dueDate: daysFromNow(5), progress: 45,
  }),
  T(12, {
    title: 'Tổ chức khám sức khỏe định kỳ năm 2026',
    departmentId: 'd3', section: 'kehoach', creatorId: 'u4', assigneeId: 'u8',
    status: 'todo', priority: 'normal', dueDate: daysFromNow(20),
  }),
  T(13, {
    title: 'Chấm công và tính lương tháng 6',
    departmentId: 'd3', section: 'hangngay', creatorId: 'u4', assigneeId: 'u8',
    status: 'doing', priority: 'urgent', dueDate: daysFromNow(1), progress: 55,
  }),
  T(14, {
    title: 'Xử lý hồ sơ nghỉ việc nhân viên kho',
    departmentId: 'd3', section: 'phatsinh', creatorId: 'u4', assigneeId: 'u8',
    status: 'done', priority: 'normal', dueDate: daysFromNow(-2), progress: 100,
    completedAt: daysFromNow(-2, 11),
  }),
  T(15, {
    title: 'Rà soát và cập nhật nội quy lao động',
    departmentId: 'd3', section: 'suvu', creatorId: 'u4', assigneeId: 'u4',
    status: 'paused', priority: 'low', dueDate: daysFromNow(30), progress: 20,
  }),

  // ── Ban Tài chính & Quản trị (d4) — phòng ban của user hiện tại
  T(16, {
    title: 'Xây dựng kế hoạch ngân sách 6 tháng cuối năm 2026',
    description: 'Lập kế hoạch ngân sách chi tiết cho từng phòng ban 6 tháng cuối năm, trình Ban Giám đốc phê duyệt trước ngày 15/7.',
    departmentId: 'd4', section: 'kehoach', creatorId: 'u5', assigneeId: 'u1', collaboratorIds: ['u3', 'u9'],
    status: 'doing', priority: 'urgent', startDate: daysFromNow(-6), dueDate: daysFromNow(3), progress: 40,
  }),
  T(17, {
    title: 'Rà soát định mức chi phí các phòng ban',
    description: 'Đối chiếu định mức chi phí hiện hành với số liệu thực tế 6 tháng đầu năm, đề xuất điều chỉnh.',
    departmentId: 'd4', section: 'suvu', creatorId: 'u5', assigneeId: 'u1',
    status: 'waiting', priority: 'high', dueDate: daysFromNow(-1), progress: 65,
  }),
  T(18, {
    title: 'Tổng hợp báo cáo quản trị tháng 6',
    departmentId: 'd4', section: 'hangngay', creatorId: 'u5', assigneeId: 'u9', collaboratorIds: ['u1'],
    status: 'doing', priority: 'high', dueDate: daysFromNow(0), progress: 50,
  }),
  T(19, {
    title: 'Đánh giá hiệu quả đầu tư dây chuyền chiết lon mới',
    departmentId: 'd4', section: 'kehoach', creatorId: 'u5', assigneeId: 'u1',
    status: 'todo', priority: 'normal', dueDate: daysFromNow(10),
  }),
  T(20, {
    title: 'Cập nhật dashboard chi phí vận hành',
    departmentId: 'd4', section: 'phatsinh', creatorId: 'u5', assigneeId: 'u9',
    status: 'done', priority: 'normal', dueDate: daysFromNow(-4), progress: 100,
    completedAt: daysFromNow(-4, 17),
  }),

  // ── Channel: Quy trình phê duyệt (c1)
  T(21, {
    title: 'Chuẩn hóa quy trình phê duyệt thanh toán',
    description: 'Thống nhất luồng phê duyệt thanh toán 3 cấp: người đề nghị → trưởng phòng → tài chính. Áp dụng từ tháng 8/2026.',
    scope: 'channel', departmentId: null, channelId: 'c1', section: null,
    creatorId: 'u5', assigneeId: 'u1', collaboratorIds: ['u2', 'u3'],
    status: 'doing', priority: 'high', startDate: daysFromNow(-8), dueDate: daysFromNow(5), progress: 35,
  }),
  T(22, {
    title: 'Soạn thảo mẫu tờ trình phê duyệt chung',
    scope: 'channel', departmentId: null, channelId: 'c1', section: null,
    creatorId: 'u5', assigneeId: 'u2',
    status: 'todo', priority: 'normal', dueDate: daysFromNow(8),
  }),

  // ── Channel: Triển khai ứng dụng nội bộ (c2)
  T(23, {
    title: 'Pilot app Giao việc tại Phòng Kế toán',
    description: 'Chạy thử nghiệm ứng dụng giao việc trong 2 tuần tại Phòng Kế toán, thu thập phản hồi người dùng.',
    scope: 'channel', departmentId: null, channelId: 'c2', section: null,
    creatorId: 'u1', assigneeId: 'u7', collaboratorIds: ['u9'],
    status: 'doing', priority: 'high', startDate: daysFromNow(-4), dueDate: daysFromNow(6), progress: 25,
  }),
  T(24, {
    title: 'Đào tạo sử dụng hệ thống giao việc cho các phòng ban',
    scope: 'channel', departmentId: null, channelId: 'c2', section: null,
    creatorId: 'u1', assigneeId: 'u4',
    status: 'todo', priority: 'normal', dueDate: daysFromNow(12),
  }),

  // ── Channel: Audit nội bộ (c3)
  T(25, {
    title: 'Kiểm tra chứng từ chi phí quý II',
    scope: 'channel', departmentId: null, channelId: 'c3', section: null,
    creatorId: 'u3', assigneeId: 'u10', collaboratorIds: ['u6'],
    status: 'doing', priority: 'high', dueDate: daysFromNow(-1), progress: 60,
  }),
  T(26, {
    title: 'Tổng hợp phát hiện audit và khuyến nghị',
    scope: 'channel', departmentId: null, channelId: 'c3', section: null,
    creatorId: 'u5', assigneeId: 'u1',
    status: 'todo', priority: 'high', dueDate: daysFromNow(9),
  }),

  // ── Việc cá nhân của user hiện tại
  T(27, {
    title: 'Chuẩn bị nội dung họp giao ban tuần',
    scope: 'personal', departmentId: null, section: null,
    creatorId: 'u1', assigneeId: 'u1',
    status: 'todo', priority: 'normal', dueDate: daysFromNow(0),
  }),
  T(28, {
    title: 'Đọc quy định mới về hóa đơn điện tử',
    scope: 'personal', departmentId: null, section: null,
    creatorId: 'u1', assigneeId: 'u1',
    status: 'done', priority: 'low', dueDate: daysFromNow(-6), progress: 100,
    completedAt: daysFromNow(-6, 20),
  }),
]

export const subtasks = [
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

export const comments = [
  { id: 'cm1', taskId: 't16', userId: 'u5', content: 'Anh Cường lưu ý deadline trình BGĐ là 15/7, cố gắng chốt dự thảo trước 10/7 nhé.', createdAt: daysFromNow(-3, 9) },
  { id: 'cm2', taskId: 't16', userId: 'u1', content: 'Vâng anh. Em đã nhận đủ số liệu từ chị Bình, đang lên dự thảo phân bổ.', createdAt: daysFromNow(-3, 10) },
  { id: 'cm3', taskId: 't16', userId: 'u3', content: 'Số liệu chi phí bên Kế toán đã gửi qua email, anh Cường kiểm tra giúp em.', createdAt: daysFromNow(-1, 14) },
  { id: 'cm4', taskId: 't17', userId: 'u5', content: 'Phần định mức văn phòng phẩm cần đối chiếu thêm với thực tế quý II.', createdAt: daysFromNow(-2, 15) },
  { id: 'cm5', taskId: 't21', userId: 'u2', content: 'Bên Pháp chế góp ý: cần bổ sung bước lưu hồ sơ phê duyệt tối thiểu 5 năm theo quy định.', createdAt: daysFromNow(-1, 10) },
  { id: 'cm6', taskId: 't1', userId: 'u2', content: 'Em ưu tiên nhóm hợp đồng sắp hết hạn trong quý III trước nhé.', createdAt: daysFromNow(-4, 8) },
  { id: 'cm7', taskId: 't1', userId: 'u6', content: 'Dạ vâng, em đã rà xong 12/20 hợp đồng, cuối tuần gửi báo cáo sơ bộ.', createdAt: daysFromNow(-2, 16) },
  { id: 'cm8', taskId: 't8', userId: 'u3', content: 'Hồ sơ đang chờ phản hồi từ Chi cục Thuế, dự kiến tuần sau có kết quả.', createdAt: daysFromNow(-2, 9) },
  { id: 'cm9', taskId: 't23', userId: 'u7', content: 'Anh em Kế toán phản hồi app dễ dùng, đề xuất thêm tính năng nhắc hạn qua email.', createdAt: daysFromNow(0, 8) },
]

export const activities = [
  { id: 'a1', taskId: 't16', userId: 'u5', action: 'create', metadata: {}, createdAt: daysFromNow(-6, 8) },
  { id: 'a2', taskId: 't16', userId: 'u5', action: 'assign', metadata: { to: 'u1' }, createdAt: daysFromNow(-6, 8) },
  { id: 'a3', taskId: 't16', userId: 'u1', action: 'status', metadata: { from: 'todo', to: 'doing' }, createdAt: daysFromNow(-5, 9) },
  { id: 'a4', taskId: 't16', userId: 'u5', action: 'comment', metadata: {}, createdAt: daysFromNow(-3, 9) },
  { id: 'a5', taskId: 't16', userId: 'u3', action: 'comment', metadata: {}, createdAt: daysFromNow(-1, 14) },
  { id: 'a6', taskId: 't17', userId: 'u5', action: 'create', metadata: {}, createdAt: daysFromNow(-9, 10) },
  { id: 'a7', taskId: 't17', userId: 'u1', action: 'status', metadata: { from: 'doing', to: 'waiting' }, createdAt: daysFromNow(-2, 11) },
  { id: 'a8', taskId: 't17', userId: 'u5', action: 'comment', metadata: {}, createdAt: daysFromNow(-2, 15) },
  { id: 'a9', taskId: 't21', userId: 'u5', action: 'create', metadata: {}, createdAt: daysFromNow(-8, 9) },
  { id: 'a10', taskId: 't21', userId: 'u2', action: 'comment', metadata: {}, createdAt: daysFromNow(-1, 10) },
  { id: 'a11', taskId: 't1', userId: 'u2', action: 'create', metadata: {}, createdAt: daysFromNow(-5, 8) },
  { id: 'a12', taskId: 't1', userId: 'u6', action: 'progress', metadata: { to: 60 }, createdAt: daysFromNow(-2, 16) },
  { id: 'a13', taskId: 't23', userId: 'u1', action: 'create', metadata: {}, createdAt: daysFromNow(-4, 9) },
  { id: 'a14', taskId: 't23', userId: 'u7', action: 'comment', metadata: {}, createdAt: daysFromNow(0, 8) },
  { id: 'a15', taskId: 't18', userId: 'u9', action: 'progress', metadata: { to: 50 }, createdAt: daysFromNow(0, 9) },
  { id: 'a16', taskId: 't5', userId: 'u2', action: 'complete', metadata: {}, createdAt: daysFromNow(-3, 16) },
  { id: 'a17', taskId: 't26', userId: 'u5', action: 'create', metadata: {}, createdAt: daysFromNow(-1, 16) },
  { id: 'a18', taskId: 't26', userId: 'u5', action: 'assign', metadata: { to: 'u1' }, createdAt: daysFromNow(-1, 16) },
]
