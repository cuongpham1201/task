import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, ArrowLeft, ArrowRight, PlayCircle, CheckCircle2, AlertTriangle, FileJson } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { apiFetch } from '../api/client'
import SearchUser from '../components/shared/SearchUser'
import Avatar from '../components/shared/Avatar'
import { deaccent } from '../utils/text'
import { ORG_TYPE } from '../utils/org'

const MAX_FILE_BYTES = 25 * 1024 * 1024
const SECTIONS = [
  { value: 'suvu', label: 'Sự vụ' },
  { value: 'kehoach', label: 'Kế hoạch' },
  { value: 'hangngay', label: 'Hằng ngày' },
  { value: 'phatsinh', label: 'Phát sinh' },
]
const PRIORITIES = [
  { value: 'low', label: 'Thấp' },
  { value: 'normal', label: 'Bình thường' },
  { value: 'high', label: 'Cao' },
  { value: 'urgent', label: 'Khẩn' },
]

const defaultConfig = () => ({
  sourceProjectGid: '',
  fieldMap: { notes: true, startDate: true, dueDate: true, followers: true, priorityFieldGid: null, tags: 'ignore', sectionMode: 'ignore', sectionSingle: null, sectionMap: {}, appSectionMode: 'ignore', appSectionSingle: null, appSectionMap: {} },
  userMap: {},
  orgBySection: {},
  missingAssigneePolicy: 'default',
  defaultAssigneeId: null,
  overrides: {},
})

const STEPS = ['Nhập dữ liệu', 'Ghép dữ liệu', 'Ánh xạ trường', 'Xem trước & nhập']

export default function AdminImportAsana() {
  const { currentUser } = useApp()
  const navigate = useNavigate()
  if (currentUser.role !== 'admin') {
    return <div className="page page-narrow"><div className="card"><p className="muted">Chỉ quản trị viên được dùng chức năng nhập dữ liệu.</p></div></div>
  }
  return <Wizard />
}

function Wizard() {
  const { toast, currentUser } = useApp()
  const [step, setStep] = useState(1)
  const [rawJson, setRawJson] = useState('')
  const [parseRes, setParseRes] = useState(null)
  const [config, setConfig] = useState(defaultConfig())
  const [targetMode, setTargetMode] = useState('none') // none (chỉ phòng ban) | new | existing
  const [targetProjectId, setTargetProjectId] = useState('')
  const [newProject, setNewProject] = useState({ name: '', memberIds: [] })
  const [defaultOrgUnitId, setDefaultOrgUnitId] = useState('')
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const patchConfig = (patch) => setConfig((c) => ({ ...c, ...patch }))
  const patchFieldMap = (patch) => setConfig((c) => ({ ...c, fieldMap: { ...c.fieldMap, ...patch } }))

  const canNext = useMemo(() => {
    if (step === 1) return !!parseRes
    if (step === 2) {
      if (!config.sourceProjectGid) return false
      if (targetMode === 'existing') return !!targetProjectId
      if (targetMode === 'new') return !!newProject.name.trim()
      return !!defaultOrgUnitId // 'none' → bắt buộc có đơn vị (không thì thành việc cá nhân)
    }
    if (step === 3) return true
    return false
  }, [step, parseRes, config.sourceProjectGid, targetMode, targetProjectId, newProject.name, defaultOrgUnitId])

  const doParse = async () => {
    if (!rawJson.trim()) return toast('Chưa có dữ liệu JSON', 'error')
    setBusy(true)
    try {
      const r = await apiFetch('/admin/import/asana/parse', { method: 'POST', body: JSON.stringify({ rawJson }) })
      setParseRes(r)
      // gợi ý dự án nguồn nếu chỉ 1
      if (r.projects?.length === 1) patchConfig({ sourceProjectGid: r.projects[0].gid })
      const src = r.projects?.[0]
      if (src && !newProject.name) setNewProject((p) => ({ ...p, name: src.name }))
      toast('Đã phân tích dữ liệu', 'success')
    } catch (e) { toast('Lỗi phân tích: ' + shortErr(e), 'error') }
    finally { setBusy(false) }
  }

  const runPreview = async () => {
    setBusy(true)
    try {
      const r = await apiFetch('/admin/import/asana/preview', {
        method: 'POST',
        body: JSON.stringify({ batchId: parseRes.batchId, config, defaultOrgUnitId: defaultOrgUnitId || undefined, targetProjectId: targetMode === 'existing' ? targetProjectId : undefined }),
      })
      setPlan(r.plan)
      toast('Đã chạy thử (chưa ghi dữ liệu)', 'success')
    } catch (e) { toast('Lỗi chạy thử: ' + shortErr(e), 'error') }
    finally { setBusy(false) }
  }

  const runExecute = async () => {
    if (!plan) return toast('Hãy chạy thử trước', 'warn')
    const willCreate = plan.summary.createTasks + plan.summary.createSubtasks
    if (!window.confirm(`Nhập THẬT ${willCreate} mục vào App Giao việc? Thông báo hàng loạt được TẮT mặc định.`)) return
    setBusy(true)
    try {
      const r = await apiFetch('/admin/import/asana/execute', {
        method: 'POST',
        body: JSON.stringify({
          batchId: parseRes.batchId, config,
          defaultOrgUnitId: defaultOrgUnitId || undefined,
          targetProjectId: targetMode === 'existing' ? targetProjectId : undefined,
          createProject: targetMode === 'new' ? { name: newProject.name.trim(), memberIds: newProject.memberIds } : undefined,
        }),
      })
      setResult(r)
      toast(`Nhập xong: ${r.created} task, ${r.createdSubtasks} việc con`, r.failed ? 'warn' : 'success')
    } catch (e) { toast('Lỗi nhập: ' + shortErr(e), 'error') }
    finally { setBusy(false) }
  }

  if (result) return <ResultView result={result} onDone={() => navigate(result.targetProjectId ? `/channels/${result.targetProjectId}` : '/')} onReset={() => { setResult(null); setPlan(null); setParseRes(null); setRawJson(''); setConfig(defaultConfig()); setStep(1) }} />

  return (
    <div className="page">
      <div className="page-head"><h1>Nhập công việc từ Asana</h1></div>
      <p className="muted" style={{ marginTop: -6, marginBottom: 14 }}>Dán hoặc tải file JSON export từ Asana → ghép người/dự án → ánh xạ trường → chạy thử → nhập. Chống trùng theo Asana gid.</p>

      <div className="import-steps">
        {STEPS.map((s, i) => (
          <button key={s} className={`import-step ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`} onClick={() => (i + 1 < step ? setStep(i + 1) : null)} disabled={i + 1 > step}>
            <span className="n">{step > i + 1 ? '✓' : i + 1}</span><span>{s}</span>
          </button>
        ))}
      </div>

      {step === 1 && <Step1 rawJson={rawJson} setRawJson={setRawJson} parseRes={parseRes} busy={busy} onParse={doParse} toast={toast} />}
      {step === 2 && <Step2 parseRes={parseRes} config={config} patchConfig={patchConfig} targetMode={targetMode} setTargetMode={setTargetMode} targetProjectId={targetProjectId} setTargetProjectId={setTargetProjectId} newProject={newProject} setNewProject={setNewProject} defaultOrgUnitId={defaultOrgUnitId} setDefaultOrgUnitId={setDefaultOrgUnitId} currentUser={currentUser} />}
      {step === 3 && <Step3 parseRes={parseRes} config={config} patchFieldMap={patchFieldMap} />}
      {step === 4 && <Step4 plan={plan} config={config} setConfig={setConfig} busy={busy} onPreview={runPreview} onExecute={runExecute} />}

      <div className="import-foot">
        <button className="btn" disabled={step === 1 || busy} onClick={() => setStep((s) => Math.max(1, s - 1))}><ArrowLeft size={15} /> Quay lại</button>
        {step < 4
          ? <button className="btn btn-primary" disabled={!canNext || busy} onClick={() => { if (step === 3) runPreview(); setStep((s) => s + 1) }}>Tiếp tục <ArrowRight size={15} /></button>
          : <span className="muted" style={{ fontSize: 12 }}>Dùng nút Chạy thử / Nhập thật bên trên.</span>}
      </div>

      <BatchHistory />
    </div>
  )
}

const shortErr = (e) => String(e?.message || e).replace(/^API [^:]+ lỗi \d+: /, '').slice(0, 300)

/* ── STEP 1 ── */
function Step1({ rawJson, setRawJson, parseRes, busy, onParse, toast }) {
  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!/\.json$/i.test(f.name) && f.type !== 'application/json') return toast('Chỉ nhận file .json', 'error')
    if (f.size > MAX_FILE_BYTES) return toast(`File quá lớn (> ${MAX_FILE_BYTES / 1024 / 1024}MB)`, 'error')
    try { setRawJson(await f.text()) } catch { toast('Không đọc được file', 'error') }
  }
  const s = parseRes?.summary
  return (
    <div className="card">
      <div className="card-head"><h2>1 · Nhập JSON Asana</h2>
        <label className="btn btn-sm"><FileJson size={15} /> Tải file .json<input type="file" accept=".json,application/json" hidden onChange={onFile} /></label>
      </div>
      <textarea className="import-textarea" placeholder='Dán JSON dạng { "data": [ ... ] } ở đây…' value={rawJson} onChange={(e) => setRawJson(e.target.value)} spellCheck={false} />
      <div className="import-foot-inline">
        <span className="muted">{rawJson ? `${(new Blob([rawJson]).size / 1024).toFixed(0)} KB` : 'Chưa có dữ liệu'}</span>
        <button className="btn btn-primary" disabled={busy || !rawJson.trim()} onClick={onParse}><UploadCloud size={15} /> {busy ? 'Đang phân tích…' : 'Phân tích'}</button>
      </div>

      {s && (
        <>
          <div className="import-stats">
            <Stat n={s.rootTasks} label="Task gốc" /><Stat n={s.subtasks} label="Việc con" />
            <Stat n={s.uniqueEntities} label="Mục unique" /><Stat n={s.projects} label="Dự án Asana" />
            <Stat n={s.users} label="Người dùng" /><Stat n={s.completedCount} label="Đã xong" tone="green" />
            <Stat n={s.notCompletedCount} label="Chưa xong" /><Stat n={s.missingAssignee} label="Thiếu người TH" tone={s.missingAssignee ? 'amber' : ''} />
            <Stat n={s.emptyTitle} label="Tên rỗng" tone={s.emptyTitle ? 'amber' : ''} /><Stat n={s.duplicateGids} label="Trùng gid (đã gộp)" tone={s.duplicateGids ? 'amber' : ''} />
          </div>
          {parseRes.warnings?.length > 0 && (
            <details className="import-warn"><summary><AlertTriangle size={14} /> {parseRes.warnings.length} cảnh báo</summary>
              <ul>{parseRes.warnings.slice(0, 50).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
const Stat = ({ n, label, tone }) => <div className="import-stat"><b className={tone ? `tone-${tone}-text` : ''}>{n}</b><span>{label}</span></div>

/* ── STEP 2 ── */
function Step2({ parseRes, config, patchConfig, targetMode, setTargetMode, targetProjectId, setTargetProjectId, newProject, setNewProject, defaultOrgUnitId, setDefaultOrgUnitId, currentUser }) {
  const { state } = useApp()
  const [orgUnits, setOrgUnits] = useState([])
  useEffect(() => { apiFetch('/admin/org-units').then((r) => setOrgUnits((r || []).filter((o) => o.active))).catch(() => setOrgUnits([])) }, [])
  const projects = parseRes.projects || []
  const users = parseRes.users || []
  const srcSections = (parseRes.sectionsByProject && parseRes.sectionsByProject[config.sourceProjectGid]) || []
  const orgOptGroups = (
    ['company', 'block', 'department'].map((t) => (
      <optgroup key={t} label={ORG_TYPE[t] || t}>
        {orgUnits.filter((o) => o.type === t).map((o) => <option key={o.id} value={o.id}>{o.name}{o.code ? ` (${o.code})` : ''}</option>)}
      </optgroup>
    ))
  )

  return (
    <>
      <div className="card">
        <div className="card-head"><h2>2 · Ghép dự án, đơn vị & người dùng</h2></div>
        <div className="form-field">
          <label>Dự án Asana nguồn <span className="req">*</span></label>
          <select value={config.sourceProjectGid} onChange={(e) => patchConfig({ sourceProjectGid: e.target.value })}>
            <option value="">— Chọn dự án nguồn —</option>
            {projects.map((p) => <option key={p.gid} value={p.gid}>{p.name} ({p.taskCount} lần xuất hiện)</option>)}
          </select>
          <span className="form-hint muted">Chỉ nhập task thuộc dự án nguồn này (kèm việc con hợp lệ của chúng).</span>
        </div>

        <div className="form-field">
          <label>Đơn vị chịu trách nhiệm {targetMode === 'none' && <span className="req">*</span>}</label>
          <select value={defaultOrgUnitId} onChange={(e) => setDefaultOrgUnitId(e.target.value)}>
            <option value="">— Không gán đơn vị —</option>
            {orgOptGroups}
          </select>
          <span className="form-hint muted">Task import thuộc đơn vị này (giống việc phòng ban). Áp cho mọi task, có thể đổi từng task ở bước xem trước.</span>
        </div>

        {srcSections.length > 0 && (
          <div className="form-field">
            <label>Gán đơn vị theo section <span className="muted" style={{ fontWeight: 400 }}>(khi project = Khối, section = phòng/ban — tùy chọn)</span></label>
            <span className="form-hint muted">Mỗi section là một phòng/ban thì map section → đơn vị tương ứng. Section không map → dùng đơn vị mặc định ở trên.</span>
            <div className="table-wrap" style={{ marginTop: 6 }}>
              <table className="task-table settings-table">
                <thead><tr><th>Section (dự án nguồn)</th><th>Số task</th><th>→ Đơn vị chịu trách nhiệm</th></tr></thead>
                <tbody>
                  {srcSections.map((s) => (
                    <tr key={s.name}>
                      <td>{s.name}</td><td>{s.count}</td>
                      <td><select value={config.orgBySection[s.name] || ''} onChange={(e) => patchConfig({ orgBySection: { ...config.orgBySection, [s.name]: e.target.value || null } })}>
                        <option value="">— Dùng đơn vị mặc định —</option>
                        {orgOptGroups}
                      </select></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="form-field">
          <label>Dự án đích trong App <span className="muted" style={{ fontWeight: 400 }}>(tùy chọn)</span></label>
          <div className="import-radio-row">
            <label><input type="radio" checked={targetMode === 'none'} onChange={() => setTargetMode('none')} /> Không gán dự án — chỉ theo phòng ban</label>
            <label><input type="radio" checked={targetMode === 'new'} onChange={() => setTargetMode('new')} /> Tạo dự án mới</label>
            <label><input type="radio" checked={targetMode === 'existing'} onChange={() => setTargetMode('existing')} /> Dùng dự án có sẵn</label>
          </div>
          {targetMode === 'none' && (
            <span className="form-hint muted">Task sẽ là việc của phòng ban (không thuộc dự án nào) — đúng khi chỉ bê task theo đơn vị về. Vẫn xem/lọc được ở dashboard phòng ban.</span>
          )}
          {targetMode === 'new' && (
            <div className="import-subform">
              <input placeholder="Tên dự án mới" value={newProject.name} onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))} />
              <span className="form-hint muted">Chủ dự án = bạn ({currentUser.displayName}). Thêm thành viên:</span>
              <MemberPicker memberIds={newProject.memberIds} onChange={(ids) => setNewProject((p) => ({ ...p, memberIds: ids }))} />
            </div>
          )}
          {targetMode === 'existing' && (
            <select value={targetProjectId} onChange={(e) => setTargetProjectId(e.target.value)}>
              <option value="">— Chọn dự án có sẵn —</option>
              {state.channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Ghép người dùng ({users.length})</h2><span className="muted" style={{ fontSize: 12 }}>Asana export không có email — ghép thủ công. Gợi ý mờ không tự xác nhận.</span></div>
        <div className="form-field">
          <label>Task thiếu người thực hiện</label>
          <div className="import-radio-row">
            <label><input type="radio" checked={config.missingAssigneePolicy === 'default'} onChange={() => patchConfig({ missingAssigneePolicy: 'default' })} /> Dùng người mặc định</label>
            <label><input type="radio" checked={config.missingAssigneePolicy === 'skip'} onChange={() => patchConfig({ missingAssigneePolicy: 'skip' })} /> Bỏ qua task đó</label>
          </div>
          {config.missingAssigneePolicy === 'default' && (
            <div style={{ maxWidth: 360, marginTop: 6 }}>
              <SearchUser value={config.defaultAssigneeId} onSelect={(id) => patchConfig({ defaultAssigneeId: id })} placeholder="Người thực hiện mặc định…" autoFocus={false} />
            </div>
          )}
        </div>
        <div className="table-wrap">
          <table className="task-table settings-table">
            <thead><tr><th>Người Asana</th><th>Số việc</th><th>Ghép với user App</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {users.map((u) => <UserMapRow key={u.gid} au={u} value={config.userMap[u.gid] || null} onSelect={(id) => patchConfig({ userMap: { ...config.userMap, [u.gid]: id } })} />)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function MemberPicker({ memberIds, onChange }) {
  const { usersById } = useApp()
  return (
    <div className="collab-chips">
      {memberIds.map((id) => (
        <span key={id} className="collab-chip">{usersById[id]?.displayName || id}<button onClick={() => onChange(memberIds.filter((x) => x !== id))}>×</button></span>
      ))}
      <div style={{ maxWidth: 300 }}>
        <SearchUser value={null} onSelect={(id) => { if (id && !memberIds.includes(id)) onChange([...memberIds, id]) }} placeholder="Thêm thành viên…" autoFocus={false} />
      </div>
    </div>
  )
}

function UserMapRow({ au, value, onSelect }) {
  const { searchUsers, usersById } = useApp()
  const [suggest, setSuggest] = useState(null) // {user, exact}
  const [tried, setTried] = useState(false)
  useEffect(() => {
    let alive = true
    searchUsers(au.name, { limit: 5 }).then((rs) => {
      if (!alive) return
      setTried(true)
      const norm = deaccent(au.name)
      const exact = (rs || []).filter((r) => deaccent(r.displayName) === norm)
      if (exact.length === 1) { setSuggest({ user: exact[0], exact: true }) }
      else if (rs && rs.length) setSuggest({ user: rs[0], exact: false })
    }).catch(() => setTried(true))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [au.gid])

  const chosen = value ? usersById[value] : null
  const status = chosen ? 'matched' : suggest?.exact ? 'suggested' : suggest ? 'fuzzy' : tried ? 'unresolved' : 'searching'
  return (
    <tr>
      <td>{au.name}<div className="muted" style={{ fontSize: 11 }}>gid {au.gid}</div></td>
      <td>{au.count}</td>
      <td style={{ minWidth: 240 }}>
        <SearchUser value={value} onSelect={(id) => onSelect(id)} placeholder="Tìm user App…" autoFocus={false} />
        {!chosen && suggest && (
          <button className="btn btn-sm" style={{ marginTop: 4 }} onClick={() => onSelect(suggest.user.id)}>
            Dùng gợi ý: {suggest.user.displayName}{suggest.exact ? ' (khớp)' : ' (mờ)'}
          </button>
        )}
      </td>
      <td><StatusChip status={status} /></td>
    </tr>
  )
}
const StatusChip = ({ status }) => {
  const map = { matched: ['tone-green', 'Đã ghép'], suggested: ['tone-blue', 'Gợi ý khớp'], fuzzy: ['tone-amber', 'Gợi ý mờ'], unresolved: ['tone-red', 'Chưa ghép'], searching: ['tone-gray', 'Đang tìm…'] }
  const [c, l] = map[status] || map.unresolved
  return <span className={`badge ${c}`}>{l}</span>
}

/* ── STEP 3 ── */
function Step3({ parseRes, config, patchFieldMap }) {
  const { state } = useApp()
  const fm = config.fieldMap
  const cfs = (parseRes.customFields || []).filter((c) => c.valueCount > 0)
  const sections = parseRes.sections || []
  const appSections = state.sections || []
  const srcSections = (parseRes.sectionsByProject && parseRes.sectionsByProject[config.sourceProjectGid]) || sections
  return (
    <div className="card">
      <div className="card-head"><h2>3 · Ánh xạ trường</h2></div>
      <div className="import-map-grid">
        <MapRow field="name → Tiêu đề" note="Bắt buộc" always />
        <MapRow field="completed → Trạng thái" note="true→Hoàn thành, false→Cần làm" always />
        <ToggleRow label="notes → Mô tả" checked={fm.notes} onChange={(v) => patchFieldMap({ notes: v })} />
        <ToggleRow label="start_on → Ngày bắt đầu" checked={fm.startDate} onChange={(v) => patchFieldMap({ startDate: v })} />
        <ToggleRow label="due_on → Hạn" checked={fm.dueDate} onChange={(v) => patchFieldMap({ dueDate: v })} />
        <ToggleRow label="followers → Người theo dõi" checked={fm.followers} onChange={(v) => patchFieldMap({ followers: v })} />
      </div>

      <div className="form-field">
        <label>Độ ưu tiên (từ custom field)</label>
        {cfs.length === 0
          ? <span className="muted">File không có custom field có dữ liệu — mọi task để mức Bình thường.</span>
          : <select value={fm.priorityFieldGid || ''} onChange={(e) => patchFieldMap({ priorityFieldGid: e.target.value || null })}>
              <option value="">— Không map (Bình thường) —</option>
              {cfs.map((c) => <option key={c.gid} value={c.gid}>{c.name} · {c.valueCount} giá trị{c.looksLikePriority ? ' ★' : ''}</option>)}
            </select>}
        <span className="form-hint muted">Low→Thấp, Medium→Bình thường, High→Cao; giá trị lạ → Bình thường + cảnh báo.</span>
      </div>

      <div className="form-field">
        <label>Nhãn (tags)</label>
        <div className="import-radio-row">
          <label><input type="radio" checked={fm.tags === 'ignore'} onChange={() => patchFieldMap({ tags: 'ignore' })} /> Bỏ qua</label>
          <label><input type="radio" checked={fm.tags === 'append'} onChange={() => patchFieldMap({ tags: 'append' })} /> Nối vào mô tả</label>
        </div>
      </div>

      <div className="form-field">
        <label>Loại việc (Sự vụ / Kế hoạch / Hằng ngày / Phát sinh)</label>
        <div className="import-radio-row">
          <label><input type="radio" checked={fm.sectionMode === 'ignore'} onChange={() => patchFieldMap({ sectionMode: 'ignore' })} /> Bỏ qua</label>
          <label><input type="radio" checked={fm.sectionMode === 'single'} onChange={() => patchFieldMap({ sectionMode: 'single' })} /> Gán 1 nhóm cho tất cả</label>
          <label><input type="radio" checked={fm.sectionMode === 'manual'} onChange={() => patchFieldMap({ sectionMode: 'manual' })} /> Map từng section</label>
        </div>
        {fm.sectionMode === 'single' && (
          <select value={fm.sectionSingle || ''} onChange={(e) => patchFieldMap({ sectionSingle: e.target.value || null })}>
            <option value="">— Chọn nhóm —</option>
            {SECTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        )}
        {fm.sectionMode === 'manual' && (
          <div className="table-wrap" style={{ marginTop: 6 }}>
            <table className="task-table settings-table">
              <thead><tr><th>Section Asana</th><th>Số task</th><th>→ Nhóm App</th></tr></thead>
              <tbody>
                {sections.map((s) => (
                  <tr key={s.name}><td>{s.name}</td><td>{s.count}</td>
                    <td><select value={fm.sectionMap[s.name] || ''} onChange={(e) => patchFieldMap({ sectionMap: { ...fm.sectionMap, [s.name]: e.target.value || null } })}>
                      <option value="">— Bỏ qua —</option>
                      {SECTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                    </select></td>
                  </tr>
                ))}
                {sections.length === 0 && <tr><td colSpan={3} className="muted">Không có section trong file.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {appSections.length > 0 && (
        <div className="form-field">
          <label>Section (nhóm sắp xếp — danh sách chung)</label>
          <div className="import-radio-row">
            <label><input type="radio" checked={fm.appSectionMode === 'ignore'} onChange={() => patchFieldMap({ appSectionMode: 'ignore' })} /> Bỏ qua</label>
            <label><input type="radio" checked={fm.appSectionMode === 'single'} onChange={() => patchFieldMap({ appSectionMode: 'single' })} /> Gán 1 Section cho tất cả</label>
            <label><input type="radio" checked={fm.appSectionMode === 'manual'} onChange={() => patchFieldMap({ appSectionMode: 'manual' })} /> Map từng section Asana</label>
          </div>
          {fm.appSectionMode === 'single' && (
            <select value={fm.appSectionSingle || ''} onChange={(e) => patchFieldMap({ appSectionSingle: e.target.value || null })}>
              <option value="">— Chọn Section —</option>
              {appSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {fm.appSectionMode === 'manual' && (
            <div className="table-wrap" style={{ marginTop: 6 }}>
              <table className="task-table settings-table">
                <thead><tr><th>Section Asana (dự án nguồn)</th><th>Số task</th><th>→ Section App</th></tr></thead>
                <tbody>
                  {srcSections.map((s) => (
                    <tr key={s.name}><td>{s.name}</td><td>{s.count}</td>
                      <td><select value={fm.appSectionMap[s.name] || ''} onChange={(e) => patchFieldMap({ appSectionMap: { ...fm.appSectionMap, [s.name]: e.target.value || null } })}>
                        <option value="">— Bỏ qua —</option>
                        {appSections.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select></td>
                    </tr>
                  ))}
                  {srcSections.length === 0 && <tr><td colSpan={3} className="muted">Không có section trong dự án nguồn.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          <span className="form-hint muted">Section = danh sách chung do admin tạo (tab Cài đặt → Section). Khác "Loại việc" ở trên.</span>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12 }}>Không nhập: người nghiệm thu (tắt), Action (không gán), assignee_status/hearts/likes/thời lượng. Việc con chỉ giữ tiêu đề + xong/chưa + người thực hiện.</p>
    </div>
  )
}
const MapRow = ({ field, note }) => <div className="import-map-item"><span className="import-map-on">✓</span><span>{field}</span><span className="muted">{note}</span></div>
const ToggleRow = ({ label, checked, onChange }) => (
  <label className="import-map-item import-map-toggle"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>
)

/* ── STEP 4 ── */
function Step4({ plan, config, setConfig, busy, onPreview, onExecute }) {
  const [filter, setFilter] = useState('all')
  const s = plan?.summary
  const items = plan?.items || []
  const setOverride = (gid, patch) => setConfig((c) => ({ ...c, overrides: { ...c.overrides, [gid]: { ...c.overrides[gid], ...patch } } }))

  const filtered = useMemo(() => {
    if (!items.length) return []
    const f = items.filter((i) => {
      if (filter === 'all') return true
      if (filter === 'create') return i.action === 'create'
      if (filter === 'existing') return i.action === 'existing'
      if (filter === 'skip') return i.action === 'skip'
      if (filter === 'error') return i.action === 'error'
      if (filter === 'warn') return i.warnings?.length
      return true
    })
    return f.slice(0, 500)
  }, [items, filter])

  return (
    <div className="card">
      <div className="card-head"><h2>4 · Xem trước & nhập</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={onPreview}><PlayCircle size={15} /> {busy ? 'Đang chạy…' : 'Chạy thử (Dry-run)'}</button>
          <button className="btn btn-primary" disabled={busy || !plan} onClick={onExecute}><CheckCircle2 size={15} /> Nhập thật</button>
        </div>
      </div>

      {!plan && <p className="muted">Bấm "Chạy thử" để xem kế hoạch nhập (không ghi dữ liệu).</p>}

      {plan && (
        <>
          <div className="import-stats">
            <Stat n={s.createTasks} label="Tạo task" tone="green" /><Stat n={s.createSubtasks} label="Tạo việc con" tone="green" />
            <Stat n={s.existing} label="Đã tồn tại" /><Stat n={s.skipped} label="Bỏ qua" tone={s.skipped ? 'amber' : ''} />
            <Stat n={s.errors} label="Lỗi" tone={s.errors ? 'red' : ''} /><Stat n={s.warnings} label="Cảnh báo" tone={s.warnings ? 'amber' : ''} />
            <Stat n={s.outOfProject} label="Ngoài dự án" /><Stat n={s.orphanSubtasks} label="Việc con mồ côi" tone={s.orphanSubtasks ? 'amber' : ''} />
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>Sau khi sửa override, bấm "Chạy thử" lại để cập nhật kế hoạch. Thông báo hàng loạt TẮT mặc định khi nhập.</p>

          <div className="tabs">
            {[['all', 'Tất cả'], ['create', 'Sẽ tạo'], ['existing', 'Đã có'], ['skip', 'Bỏ qua'], ['error', 'Lỗi'], ['warn', 'Cảnh báo']].map(([k, l]) => (
              <button key={k} className={`tab ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>

          <div className="table-wrap">
            <table className="task-table settings-table">
              <thead><tr><th>Loại</th><th>Tiêu đề</th><th>Người TH</th><th>Trạng thái</th><th>Ưu tiên</th><th>Hạn</th><th>Kết quả</th></tr></thead>
              <tbody>
                {filtered.map((it) => <PreviewRow key={it.gid} it={it} ov={config.overrides[it.gid] || {}} setOverride={setOverride} />)}
                {filtered.length === 0 && <tr><td colSpan={7} className="muted">Không có mục nào.</td></tr>}
              </tbody>
            </table>
          </div>
          {items.length > 500 && <p className="muted" style={{ fontSize: 12 }}>Hiển thị 500/{items.length} mục đầu — bộ đếm phía trên tính đủ toàn bộ.</p>}
        </>
      )}
    </div>
  )
}

function PreviewRow({ it, ov, setOverride }) {
  const { usersById } = useApp()
  const actionChip = {
    create: ['tone-green', it.kind === 'task' ? 'Tạo task' : 'Tạo việc con'],
    existing: ['tone-gray', 'Đã có'], skip: ['tone-amber', 'Bỏ qua'], error: ['tone-red', 'Lỗi'],
  }[it.action] || ['tone-gray', it.action]
  const assignee = it.assigneeId ? usersById[it.assigneeId]?.displayName || it.assigneeId : '—'
  return (
    <tr className={it.action === 'error' ? 'row-inactive' : ''}>
      <td>{it.kind === 'task' ? 'Task' : '↳ Con'}</td>
      <td style={{ maxWidth: 280 }}>
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={it.title}>{it.title || <em className="muted">(rỗng)</em>}</div>
        {it.warnings?.length > 0 && <div className="muted" style={{ fontSize: 11 }}>⚠ {it.warnings.join(' · ')}</div>}
        {it.reason && <div className="muted" style={{ fontSize: 11 }}>{it.reason}</div>}
      </td>
      <td style={{ minWidth: 180 }}>
        {it.kind === 'task' && (it.action === 'create' || it.action === 'error')
          ? <SearchUser value={it.assigneeId} onSelect={(id) => setOverride(it.gid, { assigneeId: id })} placeholder="Chọn người…" autoFocus={false} />
          : assignee}
      </td>
      <td>
        {it.action === 'create'
          ? <select value={ov.status || it.status} onChange={(e) => setOverride(it.gid, { status: e.target.value })}><option value="todo">Cần làm</option><option value="done">Hoàn thành</option></select>
          : <span className={`badge ${actionChip[0]}`}>{actionChip[1]}</span>}
      </td>
      <td>{it.action === 'create'
        ? <select value={ov.priority || it.priority} onChange={(e) => setOverride(it.gid, { priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
        : '—'}</td>
      <td>{it.dueOn || '—'}</td>
      <td>
        {it.action === 'create' && <label className="muted" style={{ fontSize: 12 }}><input type="checkbox" checked={!!ov.skip} onChange={(e) => setOverride(it.gid, { skip: e.target.checked })} /> Bỏ</label>}
        {it.action !== 'create' && <span className={`badge ${actionChip[0]}`}>{actionChip[1]}</span>}
      </td>
    </tr>
  )
}

/* ── RESULT ── */
function ResultView({ result, onDone, onReset }) {
  return (
    <div className="page page-narrow">
      <div className="card">
        <div className="card-head"><h2>Kết quả nhập</h2></div>
        <div className="import-stats">
          <Stat n={result.created} label="Task đã tạo" tone="green" />
          <Stat n={result.createdSubtasks} label="Việc con" tone="green" />
          <Stat n={result.skipped} label="Bỏ qua/đã có" />
          <Stat n={result.failed} label="Lỗi" tone={result.failed ? 'red' : ''} />
          <Stat n={result.warnings} label="Cảnh báo" tone={result.warnings ? 'amber' : ''} />
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Trạng thái batch: <b>{result.status}</b>. Thông báo hàng loạt đã được tắt (không làm phiền người thực hiện).</p>
        {result.errors?.length > 0 && (
          <details className="import-warn" open><summary><AlertTriangle size={14} /> {result.errors.length} lỗi</summary><ul>{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></details>
        )}
        <div className="import-foot">
          {result.targetProjectId && <button className="btn btn-primary" onClick={onDone}>Mở dự án đích</button>}
          <button className="btn" onClick={onReset}>Nhập lần nữa</button>
        </div>
      </div>
    </div>
  )
}

/* ── HISTORY ── */
function BatchHistory() {
  const { toast } = useApp()
  const [rows, setRows] = useState(null)
  const load = () => apiFetch('/admin/import/asana/batches').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])
  const rollback = async (b) => {
    if (!window.confirm(`Hoàn tác lần import "${b.sourceProjectName || b.id}"? Xóa toàn bộ task/việc con đã tạo bởi lần này (không xóa dự án đích).`)) return
    try {
      const r = await apiFetch(`/admin/import/asana/batches/${b.id}/rollback`, { method: 'POST' })
      toast(`Đã hoàn tác: xóa ${r.deletedTasks} task + ${r.deletedSubtasks} việc con.`, 'success')
      load()
    } catch (e) { toast('Lỗi hoàn tác: ' + shortErr(e), 'error') }
  }
  if (!rows || rows.length === 0) return null
  const canRollback = (s) => s === 'completed' || s === 'partial' || s === 'ready'
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head"><h2>Lịch sử import</h2></div>
      <div className="table-wrap">
        <table className="task-table settings-table">
          <thead><tr><th>Thời gian</th><th>Dự án nguồn</th><th>Trạng thái</th><th>Tạo</th><th>Bỏ qua</th><th>Lỗi</th><th>Thao tác</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td>{new Date(b.createdAt).toLocaleString('vi')}</td>
                <td>{b.sourceProjectName || '—'}</td>
                <td><span className={`badge ${b.status === 'completed' ? 'tone-green' : b.status === 'failed' ? 'tone-red' : b.status === 'partial' ? 'tone-amber' : b.status === 'rolledback' ? 'tone-gray' : 'tone-gray'}`}>{b.status}</span></td>
                <td>{b.createdCount}</td><td>{b.skippedCount}</td><td>{b.failedCount}</td>
                <td>{canRollback(b.status) && b.createdCount > 0 ? <button className="btn btn-sm" onClick={() => rollback(b)}>Hoàn tác</button> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
