// Seed Phase ORG-1 — cây tổ chức theo HRM (Công ty → Khối → Phòng/Ban),
// user + org_unit_roles + workspaces (ORG_UNIT & PROJECT) + tasks(workspace_id).
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const ts = (d, h = 9) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x }
const day = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) }

// ── Cây tổ chức (nguồn HRM: organization_orgblock + department.block) ──
const COMPANY = { id: 'co', code: 'BHL', name: 'Công ty CP Bia và NGK Hạ Long', type: 'company', parentId: null, legalEntity: 'HALONG' }
const BLOCKS = [
  { id: 'bdh', code: 'BDH', name: 'Ban Điều Hành', type: 'block', parentId: 'co' },
  { id: 'off', code: 'OFFICE', name: 'Khối Tài chính và Quản trị', type: 'block', parentId: 'co' },
  { id: 'sal', code: 'SALES', name: 'Khối Kinh Doanh', type: 'block', parentId: 'co' },
  { id: 'sx', code: 'SX', name: 'Khối Sản Xuất', type: 'block', parentId: 'co' },
  { id: 'tra', code: 'TRANSPORT', name: 'Khối Vận hành và Chuỗi cung ứng', type: 'block', parentId: 'co' },
]
// department: [id, code, name, blockParent, legalEntity]
const DEPTS = [
  ['pctt', 'PCTT', 'Ban Pháp chế – Tuân thủ', 'off', 'HALONG'],
  ['tcks', 'TCKS', 'Ban Tài chính – Kiểm soát nội bộ', 'off', 'HALONG'],
  ['hcns', 'HCNS', 'Phòng Hành chính – Nhân sự', 'off', 'HALONG'],
  ['kt', 'KT', 'Phòng Kế toán', 'off', 'HALONG'],
  ['mkt', 'MKT', 'Phòng Marketing', 'sal', 'HALONG'],
  ['kdbh', 'KDBH', 'Phòng Kinh doanh Bia hơi', 'sal', 'HALONG'],
  ['vhkd', 'VHKD', 'Phòng Vận hành Kinh doanh', 'sal', 'HALONG'],
  ['kpp', 'KPP', 'Kênh Phân phối', 'sal', 'HALONG'],
  ['khtc', 'KHTC', 'Kênh Khách hàng Tổ chức', 'sal', 'HALONG'],
  ['kbl', 'KBL', 'Kênh Bán Lẻ', 'sal', 'HALONG'],
  ['pxhl', 'PXHL', 'Phân xưởng Sản xuất Hạ Long', 'sx', 'HALONG'],
  ['pxdm', 'PXĐM', 'Phân xưởng Sản xuất Đông Mai', 'sx', 'DONGMAI'],
  ['cdhl', 'CĐHL', 'Phân xưởng Cơ điện – Động lực Hạ Long', 'sx', 'HALONG'],
  ['cddm', 'CĐĐM', 'Phân xưởng Cơ điện – Động lực Đông Mai', 'sx', 'DONGMAI'],
  ['cd', 'CĐ', 'Phòng Cơ điện', 'sx', 'HALONG'],
  ['kcs', 'KCS', 'Phòng Kiểm soát Chất lượng – KCS', 'sx', 'HALONG'],
  ['ktcn', 'KTCN', 'Phòng Kỹ thuật, Công nghệ & Cải tiến SX', 'sx', 'HALONG'],
  ['iso', 'ISO', 'Ban ISO', 'tra', 'HALONG'],
  ['she', 'SHE', 'Ban S-H-E', 'tra', 'HALONG'],
  ['khvt', 'KHVT', 'Phòng Kế hoạch – Vật tư', 'tra', 'HALONG'],
  ['ttdh', 'TTĐH', 'Trung tâm Điều hành', 'tra', 'HALONG'],
]
const orgUnits = [
  COMPANY,
  ...BLOCKS.map((b, i) => ({ ...b, legalEntity: 'GROUP', sortOrder: i })),
  ...DEPTS.map(([id, code, name, parentId, le], i) => ({ id, code, name, type: 'department', parentId, legalEntity: le, sortOrder: i })),
]

// ── Users (org_unit_id = phòng/ban chính) ──
const users = [
  { id: 'u1', displayName: 'Phạm Xuân Cường', email: 'cuongpx@biahalong.com', orgUnitId: 'ttdh', role: 'admin' },   // system admin
  { id: 'u2', displayName: 'Nguyễn Văn An', email: 'annv@biahalong.com', orgUnitId: 'bdh', role: 'manager' },       // TGĐ
  { id: 'u3', displayName: 'Trần Thị Bình', email: 'binhtt@biahalong.com', orgUnitId: 'hcns', role: 'manager' },    // GĐ TC&QT (khối OFFICE)
  { id: 'u4', displayName: 'Lê Minh Châu', email: 'chaulm@biahalong.com', orgUnitId: 'kt', role: 'manager' },       // Trưởng phòng Kế toán
  { id: 'u5', displayName: 'Hoàng Đức Dũng', email: 'dunghd@biahalong.com', orgUnitId: 'kt', role: 'member' },      // NV Kế toán
  { id: 'u6', displayName: 'Vũ Thị Em', email: 'emvt@biahalong.com', orgUnitId: 'pctt', role: 'manager' },          // Trưởng Ban Pháp chế
  { id: 'u7', displayName: 'Đỗ Quang Huy', email: 'huydq@biahalong.com', orgUnitId: 'pctt', role: 'member' },       // NV Pháp chế
  { id: 'u8', displayName: 'Bùi Thu Hà', email: 'habt@biahalong.com', orgUnitId: 'mkt', role: 'manager' },          // GĐ Kinh doanh (khối SALES)
  { id: 'u9', displayName: 'Ngô Văn Khoa', email: 'khoanv@biahalong.com', orgUnitId: 'mkt', role: 'member' },       // NV Marketing
  { id: 'u10', displayName: 'Phan Thị Lan', email: 'lanpt@biahalong.com', orgUnitId: 'hcns', role: 'member' },      // NV HCNS
]

// ── Quyền tổ chức ──
const orgRoles = [
  { userId: 'u2', orgUnitId: 'co', role: 'ceo', scope: 'include_children' },              // TGĐ → toàn công ty
  { userId: 'u3', orgUnitId: 'off', role: 'block_director', scope: 'include_children' },   // GĐ TC&QT → khối OFFICE
  { userId: 'u8', orgUnitId: 'sal', role: 'block_director', scope: 'include_children' },    // GĐ Kinh doanh → khối SALES
  { userId: 'u4', orgUnitId: 'kt', role: 'department_manager', scope: 'self_only' },         // TP Kế toán
  { userId: 'u6', orgUnitId: 'pctt', role: 'department_manager', scope: 'self_only' },       // TP Pháp chế
]

// ── Workspaces ──
// ORG_UNIT: 1 workspace/phòng-ban (member suy động từ org tree)
const orgWorkspaces = DEPTS.map(([id, , name]) => ({ id: `w-${id}`, type: 'org_unit', name, orgUnitId: id }))
// PROJECT: dự án kiểu Asana (member thủ công)
const projects = [
  { id: 'p1', name: 'Quy trình phê duyệt', description: 'Chuẩn hóa quy trình phê duyệt liên phòng ban', ownerId: 'u3', members: ['u3', 'u4', 'u6'] },
  { id: 'p2', name: 'Triển khai ứng dụng nội bộ', description: 'Triển khai app Giao việc', ownerId: 'u1', members: ['u1', 'u5', 'u9'] },
  { id: 'p3', name: 'Audit nội bộ', description: 'Kiểm toán nội bộ quý II/2026', ownerId: 'u3', members: ['u3', 'u7', 'u10'] },
]

// ── Tasks (workspaceId) ──
const T = (id, over) => ({
  id: `t${id}`, title: '', description: '', workspaceId: null, section: 'suvu',
  creatorId: 'u2', assigneeId: 'u1', collaboratorIds: [], status: 'todo', priority: 'normal',
  startDate: null, dueDate: null, progress: 0, completionMode: 'self', createdAt: ts(-10, 9), completedAt: null, ...over,
})
const tasks = [
  // Phòng Kế toán (w-kt)
  T(1, { title: 'Đối chiếu công nợ nhà phân phối tháng 6', workspaceId: 'w-kt', section: 'hangngay', creatorId: 'u4', assigneeId: 'u5', status: 'doing', priority: 'high', dueDate: day(0), progress: 70 }),
  T(2, { title: 'Lập báo cáo tài chính quý II/2026', workspaceId: 'w-kt', section: 'kehoach', creatorId: 'u4', assigneeId: 'u5', status: 'doing', priority: 'urgent', dueDate: day(4), progress: 30 }),
  T(3, { title: 'Hoàn thiện hồ sơ quyết toán thuế 2025', workspaceId: 'w-kt', section: 'suvu', creatorId: 'u4', assigneeId: 'u5', status: 'waiting', priority: 'high', dueDate: day(-5), progress: 80 }),
  T(4, { title: 'Thanh toán chi phí vận chuyển tháng 6', workspaceId: 'w-kt', section: 'hangngay', creatorId: 'u4', assigneeId: 'u5', status: 'done', priority: 'normal', dueDate: day(-1), progress: 100, completedAt: ts(-1, 15) }),
  // Ban Pháp chế (w-pctt)
  T(5, { title: 'Rà soát hợp đồng phân phối miền Bắc', workspaceId: 'w-pctt', section: 'suvu', creatorId: 'u6', assigneeId: 'u7', status: 'doing', priority: 'high', startDate: day(-5), dueDate: day(2), progress: 60 }),
  T(6, { title: 'Cập nhật quy chế quản lý hợp đồng', workspaceId: 'w-pctt', section: 'kehoach', creatorId: 'u6', assigneeId: 'u7', status: 'waiting', priority: 'normal', dueDate: day(7), progress: 40 }),
  T(7, { title: 'Tư vấn pháp lý tranh chấp vỏ lon', workspaceId: 'w-pctt', section: 'suvu', creatorId: 'u6', assigneeId: 'u7', status: 'doing', priority: 'urgent', dueDate: day(-2), progress: 50, completionMode: 'review_required' }),
  // Phòng HCNS (w-hcns)
  T(8, { title: 'Tuyển NV kinh doanh khu vực Quảng Ninh', workspaceId: 'w-hcns', section: 'kehoach', creatorId: 'u3', assigneeId: 'u10', status: 'doing', priority: 'high', dueDate: day(5), progress: 45 }),
  T(9, { title: 'Chấm công và tính lương tháng 6', workspaceId: 'w-hcns', section: 'hangngay', creatorId: 'u3', assigneeId: 'u10', status: 'doing', priority: 'urgent', dueDate: day(1), progress: 55 }),
  T(10, { title: 'Rà soát nội quy lao động', workspaceId: 'w-hcns', section: 'suvu', creatorId: 'u3', assigneeId: 'u10', status: 'paused', priority: 'low', dueDate: day(30), progress: 20 }),
  // Ban Tài chính – KSNB (w-tcks)
  T(11, { title: 'Xây dựng kế hoạch ngân sách 6 tháng cuối năm', workspaceId: 'w-tcks', section: 'kehoach', creatorId: 'u3', assigneeId: 'u3', status: 'doing', priority: 'urgent', dueDate: day(3), progress: 40 }),
  T(12, { title: 'Rà soát định mức chi phí các phòng ban', workspaceId: 'w-tcks', section: 'suvu', creatorId: 'u3', assigneeId: 'u3', status: 'waiting', priority: 'high', dueDate: day(-1), progress: 65 }),
  // Phòng Marketing (w-mkt)
  T(13, { title: 'Kế hoạch truyền thông ra mắt sản phẩm', workspaceId: 'w-mkt', section: 'kehoach', creatorId: 'u8', assigneeId: 'u9', status: 'doing', priority: 'high', dueDate: day(6), progress: 35 }),
  T(14, { title: 'Thiết kế bộ nhận diện điểm bán', workspaceId: 'w-mkt', section: 'suvu', creatorId: 'u8', assigneeId: 'u9', status: 'todo', priority: 'normal', dueDate: day(12) }),
  T(15, { title: 'Báo cáo hiệu quả chiến dịch tháng 6', workspaceId: 'w-mkt', section: 'hangngay', creatorId: 'u8', assigneeId: 'u9', status: 'done', priority: 'normal', dueDate: day(-3), progress: 100, completedAt: ts(-3, 16) }),
  // PX Sản xuất Hạ Long (w-pxhl)
  T(16, { title: 'Kế hoạch sản xuất tuần 27', workspaceId: 'w-pxhl', section: 'kehoach', creatorId: 'u2', assigneeId: 'u2', status: 'doing', priority: 'high', dueDate: day(2), progress: 50 }),
  // Dự án
  T(17, { title: 'Chuẩn hóa quy trình phê duyệt thanh toán', workspaceId: 'p1', creatorId: 'u3', assigneeId: 'u4', collaboratorIds: ['u6'], status: 'doing', priority: 'high', startDate: day(-8), dueDate: day(5), progress: 35, completionMode: 'review_required' }),
  T(18, { title: 'Soạn mẫu tờ trình phê duyệt chung', workspaceId: 'p1', creatorId: 'u3', assigneeId: 'u6', status: 'todo', priority: 'normal', dueDate: day(8) }),
  T(19, { title: 'Pilot app Giao việc tại Phòng Kế toán', workspaceId: 'p2', creatorId: 'u1', assigneeId: 'u5', collaboratorIds: ['u9'], status: 'doing', priority: 'high', dueDate: day(6), progress: 25 }),
  T(20, { title: 'Tổng hợp phát hiện audit', workspaceId: 'p3', creatorId: 'u3', assigneeId: 'u7', status: 'todo', priority: 'high', dueDate: day(9) }),
  // Cá nhân (workspaceId null)
  T(21, { title: 'Chuẩn bị nội dung họp giao ban tuần', workspaceId: null, section: null, creatorId: 'u1', assigneeId: 'u1', status: 'todo', priority: 'normal', dueDate: day(0) }),
  T(22, { title: 'Đọc quy định mới về hóa đơn điện tử', workspaceId: null, section: null, creatorId: 'u5', assigneeId: 'u5', status: 'done', priority: 'low', dueDate: day(-6), progress: 100, completedAt: ts(-6, 20) }),
]

const subtasks = [
  { id: 's1', taskId: 't5', title: 'Tập hợp hợp đồng còn hiệu lực', done: true, assigneeId: 'u7' },
  { id: 's2', taskId: 't5', title: 'Rà soát điều khoản thanh toán', done: false, assigneeId: 'u7' },
  { id: 's3', taskId: 't11', title: 'Thu thập số liệu chi phí', done: true, assigneeId: 'u3' },
  { id: 's4', taskId: 't11', title: 'Dự thảo phân bổ ngân sách', done: false, assigneeId: 'u3' },
  { id: 's5', taskId: 't17', title: 'Khảo sát luồng phê duyệt hiện tại', done: true, assigneeId: 'u4' },
  { id: 's6', taskId: 't17', title: 'Vẽ sơ đồ quy trình chuẩn', done: false, assigneeId: 'u4' },
]
const comments = [
  { id: 'cm1', taskId: 't11', userId: 'u3', content: 'Cố gắng chốt dự thảo trước 10/7 nhé.', createdAt: ts(-3, 9) },
  { id: 'cm2', taskId: 't5', userId: 'u6', content: 'Ưu tiên nhóm hợp đồng sắp hết hạn.', createdAt: ts(-4, 8) },
  { id: 'cm3', taskId: 't17', userId: 'u4', content: 'Đã khảo sát xong 3 phòng.', createdAt: ts(-1, 10) },
]
const activities = [
  { taskId: 't11', userId: 'u3', action: 'create', metadata: {}, createdAt: ts(-6, 8) },
  { taskId: 't5', userId: 'u6', action: 'create', metadata: {}, createdAt: ts(-5, 8) },
  { taskId: 't17', userId: 'u3', action: 'create', metadata: {}, createdAt: ts(-8, 9) },
  { taskId: 't17', userId: 'u4', action: 'progress', metadata: { to: 35 }, createdAt: ts(-1, 10) },
]

async function main() {
  // Xóa theo thứ tự FK
  await prisma.syncLog.deleteMany()
  await prisma.taskKpiResult.deleteMany()
  await prisma.externalOrgMapping.deleteMany()
  await prisma.externalUserMapping.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.activity.deleteMany()
  await prisma.comment.deleteMany()
  await prisma.subtask.deleteMany()
  await prisma.attachment.deleteMany()
  await prisma.taskReview.deleteMany()
  await prisma.taskCollaborator.deleteMany()
  await prisma.taskWatcher.deleteMany()
  await prisma.task.deleteMany()
  await prisma.workspaceMember.deleteMany()
  await prisma.workspace.deleteMany()
  await prisma.orgUnitRole.deleteMany()
  await prisma.user.deleteMany()
  await prisma.orgUnit.deleteMany()

  // Org tree — tạo theo thứ tự cấp để parent tồn tại trước
  await prisma.orgUnit.create({ data: COMPANY })
  await prisma.orgUnit.createMany({ data: orgUnits.filter((o) => o.type === 'block') })
  await prisma.orgUnit.createMany({ data: orgUnits.filter((o) => o.type === 'department') })

  await prisma.user.createMany({ data: users })
  await prisma.orgUnitRole.createMany({ data: orgRoles })

  await prisma.workspace.createMany({ data: orgWorkspaces })
  await prisma.workspace.createMany({ data: projects.map(({ members, ...p }) => ({ ...p, type: 'project' })) })
  await prisma.workspaceMember.createMany({
    data: projects.flatMap((p) => p.members.map((userId) => ({
      workspaceId: p.id, userId, role: userId === p.ownerId ? 'owner' : 'member',
    }))),
  })

  await prisma.task.createMany({ data: tasks.map(({ collaboratorIds, ...t }) => t) })
  await prisma.taskCollaborator.createMany({
    data: tasks.flatMap((t) => t.collaboratorIds.map((userId) => ({ taskId: t.id, userId }))),
  })
  await prisma.subtask.createMany({ data: subtasks })
  await prisma.comment.createMany({ data: comments })
  await prisma.activity.createMany({ data: activities })

  console.log('Seed ORG-1 xong:', {
    orgUnits: await prisma.orgUnit.count(),
    users: await prisma.user.count(),
    orgRoles: await prisma.orgUnitRole.count(),
    workspaces: await prisma.workspace.count(),
    tasks: await prisma.task.count(),
  })
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
