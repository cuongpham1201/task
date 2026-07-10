/**
 * Đóng gói Microsoft Teams app package cho App Giao việc.
 * Pattern theo approval-bhl/scripts/package-teams-app.js (đã chạy production).
 *
 * - Zip chứa ĐÚNG 3 file ở ROOT: manifest.json, color.png, outline.png
 * - webApplicationInfo.id: inject từ env AZURE_AD_CLIENT_ID (đọc apps/api/.env,
 *   KHÔNG commit giá trị thật vào manifest — repo giữ placeholder __AZURE_CLIENT_ID__)
 * - Validate: GUID id, version, icon tồn tại, templateText khớp templateParameters
 * - Output: dist/teams/giao-viec-teams-v<version>.zip
 *
 * Chạy: npm run teams:package
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'teams')
const OUT_DIR = join(ROOT, 'dist', 'teams')
const GUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i

// Nạp AZURE_AD_CLIENT_ID từ apps/api/.env (không bắt buộc — thiếu thì giữ placeholder + cảnh báo)
function loadClientId() {
  if (process.env.AZURE_AD_CLIENT_ID) return process.env.AZURE_AD_CLIENT_ID.trim()
  const envPath = join(ROOT, 'apps/api/.env')
  if (!existsSync(envPath)) return null
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^AZURE_AD_CLIENT_ID\s*=\s*(.+)$/.exec(line.trim())
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}

const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'))

// ── Validate ──
const errs = []
if (!GUID.test(manifest.id)) errs.push(`manifest.id không phải GUID: ${manifest.id}`)
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) errs.push(`version không hợp lệ: ${manifest.version}`)
for (const f of ['color.png', 'outline.png']) if (!existsSync(join(SRC, f))) errs.push(`thiếu ${f}`)
for (const at of manifest.activities?.activityTypes ?? []) {
  const params = [...at.templateText.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
  if (params.length !== 1 || params[0] !== 'taskInfo') errs.push(`activityType ${at.type}: templateText phải dùng đúng 1 placeholder {taskInfo}`)
}

// ── Inject client id ──
const clientId = loadClientId()
let resolvedManifest
if (clientId && GUID.test(clientId)) {
  resolvedManifest = JSON.stringify(manifest, null, 2).replaceAll('__AZURE_CLIENT_ID__', clientId)
} else {
  errs.push('AZURE_AD_CLIENT_ID không tìm thấy/không hợp lệ — webApplicationInfo sẽ giữ placeholder (KHÔNG upload được)')
  resolvedManifest = JSON.stringify(manifest, null, 2)
}
if (errs.length) {
  console.error('⚠ Validation:'); errs.forEach((e) => console.error('  -', e))
  if (!clientId) console.error('  → set AZURE_AD_CLIENT_ID hoặc apps/api/.env rồi chạy lại.')
  if (errs.some((e) => !e.includes('AZURE_AD_CLIENT_ID'))) process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })
const zipName = `giao-viec-teams-v${manifest.version}.zip`
const zipPath = join(OUT_DIR, zipName)

// Zip bằng python3 zipfile (sẵn có, không thêm dep) — 3 file ở ROOT zip.
const py = `
import zipfile, sys
zf = zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED)
zf.writestr('manifest.json', open(sys.argv[2]).read())
zf.write(sys.argv[3], 'color.png')
zf.write(sys.argv[4], 'outline.png')
zf.close()
print('zip OK')
`
const tmpManifest = join(OUT_DIR, '.manifest.resolved.json')
writeFileSync(tmpManifest, resolvedManifest)
execFileSync('python3', ['-c', py, zipPath, tmpManifest, join(SRC, 'color.png'), join(SRC, 'outline.png')], { stdio: 'inherit' })

console.log(`✅ ${zipPath}`)
console.log(`   Teams App ID: ${manifest.id} · version ${manifest.version} · webApplicationInfo: ${clientId ? 'đã inject từ env' : 'PLACEHOLDER (chưa upload được)'}`)
