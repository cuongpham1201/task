/**
 * HRM → Task App sync (TỐI THIỂU, MỘT CHIỀU, READ-ONLY nguồn HRM).
 * Nguồn: HRM dev Postgres (biahalong_cb) — chỉ SELECT. KHÔNG ghi HRM. KHÔNG prod. KHÔNG KPI/lương.
 * Đích: Task App Postgres (giaoviec) qua Prisma — upsert org_units + users + roles.
 * Idempotent: chạy lại không nhân đôi (key theo external_hrm_id / email / emp_code).
 * Không xóa cứng: HRM nghỉ việc / đơn vị mất → active=false.
 *
 * Chạy: npm run sync:hrm-dev   (node --env-file=apps/api/.env)
 */
import { PrismaClient } from '@prisma/client'
import { execFileSync } from 'node:child_process'

const HRM_URL = process.env.HRM_DEV_DATABASE_URL
if (!HRM_URL) { console.error('❌ Thiếu HRM_DEV_DATABASE_URL trong .env'); process.exit(1) }
// GUARD: chỉ cho phép DB dev biahalong_cb — chặn nhầm production tuyệt đối.
if (!/\/biahalong_cb(\?|$)/.test(HRM_URL)) {
  console.error('❌ HRM_DEV_DATABASE_URL không trỏ tới biahalong_cb (dev). Dừng để tránh đụng prod.')
  process.exit(1)
}

const prisma = new PrismaClient()

// Read-only: chỉ SELECT, gói vào json_agg để parse an toàn.
const q = (inner) => {
  const sql = `SELECT coalesce(json_agg(row_to_json(t)),'[]'::json)::text FROM (${inner}) t`
  const out = execFileSync('psql', [HRM_URL, '-tAc', sql], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
  return JSON.parse(out.trim() || '[]')
}

// MANUAL TEST ROLES — HRM dev THIẾU block head + hầu hết department head, nên seed tạm
// vài role thật (có work_email) để test visibility. Ghi rõ source='MANUAL_TEST' để dễ gỡ.
const MANUAL_TEST_ROLES = [
  { email: 'huyentt@biahalong.com', orgCode: 'OFFICE', role: 'block_director', scope: 'include_children' }, // GĐ khối OFFICE (test)
  { email: 'huongtt@biahalong.com', orgCode: 'KT', role: 'department_manager', scope: 'self_only' },        // TP Kế toán (test)
]

const report = { blocks: 0, divisions: 0, divisionsCreated: 0, users: 0, usersCreated: 0, usersNoLogin: 0, deactivatedUsers: 0, deactivatedOrgs: 0, rolesHrm: 0, rolesManual: 0, codeClashes: [], missingOrg: [] }

async function main() {
  const startedAt = new Date()

  // ── 1. Đọc HRM (read-only) ──
  const blocks = q(`SELECT id, code, name, "order" AS ord FROM organization_orgblock`)
  const divisions = q(`
    SELECT d.id, d.code, d.short_name, d.name, d.block, d.head_id, e.code AS entity_code
    FROM organization_department d JOIN organization_legalentity e ON e.id = d.entity_id
    WHERE d.kind = 'DIVISION' ORDER BY d.entity_id, d.id`)
  const employees = q(`
    SELECT e.id, e.emp_code, e.full_name, e.email, e.work_email, e.job_title, e.division_id
    FROM employees_employee e WHERE e.status = 'ACTIVE'`)
  console.log(`HRM dev: ${blocks.length} khối · ${divisions.length} phòng/ban(DIVISION) · ${employees.length} NV active`)

  // ── 2. Company root ──
  const company = await prisma.orgUnit.upsert({
    where: { code: 'BHL' },
    create: { code: 'BHL', name: 'Công ty CP Bia & NGK Hạ Long', type: 'company', legalEntity: 'GROUP', source: 'HRM', externalHrmId: 'hrm:company' },
    update: { type: 'company', source: 'HRM' },
  })

  // ── 3. Blocks (khối) — match theo code, giữ id cũ nếu có ──
  const blockByCode = {}
  for (const b of blocks) {
    const ou = await prisma.orgUnit.upsert({
      where: { code: b.code },
      create: { code: b.code, name: b.name, type: 'block', parentId: company.id, sortOrder: b.ord || 0, source: 'HRM', externalHrmId: `hrm:block:${b.id}`, active: true },
      update: { name: b.name, type: 'block', parentId: company.id, sortOrder: b.ord || 0, externalHrmId: `hrm:block:${b.id}`, active: true, source: 'HRM' },
    })
    blockByCode[b.code] = ou.id
    report.blocks++
  }

  // ── 4. Divisions (phòng/ban/kênh/phân xưởng) → org_unit type=department ──
  const deptByHrmId = {} // hrm division id → task org unit id
  const orgCodeToId = {} // code → id (cho manual role)
  const syncedDeptExt = new Set()
  for (const d of divisions) {
    const ext = `hrm:dept:${d.id}`
    syncedDeptExt.add(ext)
    const desiredCode = String(d.short_name || d.code || `D${d.id}`).toUpperCase().slice(0, 10)
    const data = {
      name: d.name, type: 'department', parentId: blockByCode[d.block] ?? company.id,
      legalEntity: d.entity_code, source: 'HRM', externalHrmId: ext, active: true,
    }
    // Ưu tiên khớp external_hrm_id; nếu chưa có, khớp org cũ (seed) theo code để GIỮ id (không phá task/action cũ)
    let ou = await prisma.orgUnit.findFirst({ where: { externalHrmId: ext } })
    if (!ou) ou = await prisma.orgUnit.findFirst({ where: { code: desiredCode, externalHrmId: null } })
    if (ou) {
      await prisma.orgUnit.update({ where: { id: ou.id }, data })
    } else {
      let code = desiredCode
      if (await prisma.orgUnit.findUnique({ where: { code } })) { code = `${desiredCode.slice(0, 6)}-${d.entity_code}`; report.codeClashes.push({ short: desiredCode, used: code }) }
      ou = await prisma.orgUnit.create({ data: { code, ...data } })
      report.divisionsCreated++
    }
    deptByHrmId[d.id] = ou.id
    orgCodeToId[ou.code] = ou.id
    // org_unit workspace (FE compat) — tạo nếu thiếu
    const ws = await prisma.workspace.findFirst({ where: { type: 'org_unit', orgUnitId: ou.id } })
    if (!ws) await prisma.workspace.create({ data: { type: 'org_unit', name: d.name, orgUnitId: ou.id } })
    report.divisions++
  }

  // ── 5. Users (nhân viên active) — key theo email; giữ role hiện có; new = member ──
  const userByHrmEmp = {}
  const activeHrmIds = new Set(employees.map((e) => String(e.id)))
  for (const e of employees) {
    const workEmail = (e.work_email || '').trim().toLowerCase()
    const isBhl = /@biahalong\.com$/.test(workEmail)
    let email = isBhl ? workEmail : ((e.email || '').trim().toLowerCase() || `${e.emp_code}@hrm.local`)
    if (!isBhl) report.usersNoLogin++
    const orgUnitId = deptByHrmId[e.division_id] || null
    if (!orgUnitId && e.division_id) report.missingOrg.push(e.emp_code)

    let user = await prisma.user.findUnique({ where: { email } })
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { displayName: e.full_name, orgUnitId: orgUnitId ?? user.orgUnitId, jobTitle: e.job_title || null, active: true } })
    } else {
      try {
        user = await prisma.user.create({ data: { email, displayName: e.full_name, orgUnitId, jobTitle: e.job_title || null, role: 'member', active: true } })
      } catch {
        email = `${e.emp_code}@hrm.local` // đụng email → dùng synthetic
        user = await prisma.user.upsert({ where: { email }, create: { email, displayName: e.full_name, orgUnitId, jobTitle: e.job_title || null, role: 'member', active: true }, update: { displayName: e.full_name, orgUnitId, active: true } })
      }
      report.usersCreated++
    }
    await prisma.externalUserMapping.upsert({
      where: { userId: user.id },
      create: { userId: user.id, entraObjectId: `hrm-emp-${e.id}`, empCode: e.emp_code, hrmEmployeeId: String(e.id) },
      update: { empCode: e.emp_code, hrmEmployeeId: String(e.id), syncedAt: new Date() },
    })
    userByHrmEmp[String(e.id)] = user.id
    report.users++
  }

  // ── 6. Deactivate (không xóa cứng) NV đã nghỉ / đơn vị mất ──
  const mappings = await prisma.externalUserMapping.findMany({ select: { userId: true, hrmEmployeeId: true } })
  for (const m of mappings) {
    if (m.hrmEmployeeId && !activeHrmIds.has(m.hrmEmployeeId)) {
      await prisma.user.update({ where: { id: m.userId }, data: { active: false } })
      report.deactivatedUsers++
    }
  }
  const staleOrgs = await prisma.orgUnit.findMany({ where: { type: 'department', externalHrmId: { startsWith: 'hrm:dept:' } }, select: { id: true, externalHrmId: true } })
  for (const o of staleOrgs) {
    if (!syncedDeptExt.has(o.externalHrmId)) { await prisma.orgUnit.update({ where: { id: o.id }, data: { active: false } }); report.deactivatedOrgs++ }
  }

  // ── 7. Roles: từ HRM division head (data-driven) + MANUAL_TEST (ghi rõ) ──
  await prisma.orgUnitRole.deleteMany({ where: { source: { in: ['HRM_SYNC', 'MANUAL_TEST'] } } })
  for (const d of divisions) {
    if (d.head_id && userByHrmEmp[String(d.head_id)] && deptByHrmId[d.id]) {
      await prisma.orgUnitRole.create({ data: { userId: userByHrmEmp[String(d.head_id)], orgUnitId: deptByHrmId[d.id], role: 'department_manager', scope: 'self_only', source: 'HRM_SYNC', active: true } })
      report.rolesHrm++
    }
  }
  for (const r of MANUAL_TEST_ROLES) {
    const user = await prisma.user.findUnique({ where: { email: r.email } })
    const orgId = orgCodeToId[r.orgCode] || blockByCode[r.orgCode]
    if (user && orgId) {
      await prisma.orgUnitRole.create({ data: { userId: user.id, orgUnitId: orgId, role: r.role, scope: r.scope, source: 'MANUAL_TEST', active: true } })
      report.rolesManual++
    } else {
      console.warn(`⚠ MANUAL_TEST role bỏ qua: ${r.email} @ ${r.orgCode} (user/org không tìm thấy)`)
    }
  }

  // ── 8. Sync log ──
  await prisma.syncLog.create({ data: { direction: 'inbound', entity: 'hrm-dev:org+users', count: report.divisions + report.users, status: 'ok', startedAt, finishedAt: new Date() } })

  console.log('\n═══ KẾT QUẢ SYNC ═══')
  console.log(JSON.stringify({ ...report, codeClashes: report.codeClashes.length, missingOrg: report.missingOrg.length }, null, 2))
  await prisma.$disconnect()
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
