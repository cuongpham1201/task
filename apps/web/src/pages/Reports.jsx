import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCw, X, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { apiFetch } from '../api/client'
import Avatar from '../components/shared/Avatar'
import SearchUser from '../components/shared/SearchUser'
import { StatusBadge } from '../components/shared/badges'
import { Donut, BarChart, HBarList, TrendChart, STATUS_COLORS } from '../components/shared/charts'
import { orgUnitLabel, orgUnitShortLabel, legalEntityLabel } from '../utils/org'
import { STATUS, ACTION_STATUS } from '../data/constants'
import { formatDate } from '../utils/date'

/**
 * P1-1 — BÁO CÁO TỔNG HỢP BLĐ. Số liệu 100% từ backend (/reports/overview),
 * drill-down (/reports/tasks) dùng CHUNG where-builder → luôn khớp summary.
 * Quy tắc số liệu: apps/api/src/reports/report-rules.ts (tập chính theo createdAt,
 * hoàn thành trong kỳ theo completedAt, quá hạn tính tại hiện tại). KHÔNG PHẢI KPI.
 */

const PRESETS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'today', label: 'Hôm nay' },
  { key: 'week', label: 'Tuần này' },
  { key: 'month', label: 'Tháng này' },
  { key: 'quarter', label: 'Quý này' },
  { key: 'year', label: 'Năm nay' },
  { key: 'custom', label: 'Tùy chọn…' },
]
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function presetRange(key) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  switch (key) {
    case 'today': return { from: iso(now), to: iso(now) }
    case 'week': {
      const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7))
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      return { from: iso(mon), to: iso(sun) }
    }
    case 'month': return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) }
    case 'quarter': {
      const q = Math.floor(m / 3) * 3
      return { from: iso(new Date(y, q, 1)), to: iso(new Date(y, q + 3, 0)) }
    }
    case 'year': return { from: `${y}-01-01`, to: `${y}-12-31` }
    default: return { from: '', to: '' }
  }
}
// Kỳ trước liền kề (cùng độ dài) — cho so sánh kỳ tab Action
function prevRange(from, to) {
  if (!from || !to) return null
  const f = new Date(from), t = new Date(to)
  const days = Math.round((t - f) / 86400000) + 1
  const pf = new Date(f); pf.setDate(f.getDate() - days)
  const pt = new Date(f); pt.setDate(f.getDate() - 1)
  return { from: iso(pf), to: iso(pt) }
}

const TABS = [
  { key: 'task', label: 'Công việc' },
  { key: 'action', label: 'Action Log' },
  { key: 'org', label: 'Phòng ban' },
]

export default function Reports() {
  const { state, permissions, visibleDepartments, selectTask, usersById } = useApp()
  const [sp, setSp] = useSearchParams()

  // ── Filter state đồng bộ URL (reload/share không mất) ──
  const tab = sp.get('tab') || 'task'
  const preset = sp.get('preset') || 'all'
  const range = preset === 'custom' ? { from: sp.get('from') || '', to: sp.get('to') || '' } : presetRange(preset)
  const filters = {
    orgUnitId: sp.get('org') || '',
    projectId: sp.get('project') || '',
    actionId: sp.get('action') || '',
    assigneeId: sp.get('assignee') || '',
    status: sp.get('status') || '',
  }
  const setParam = (patch) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k))
    setSp(next, { replace: true })
  }

  const query = useMemo(() => {
    const q = new URLSearchParams()
    if (range.from) q.set('from', range.from)
    if (range.to) q.set('to', range.to)
    if (filters.orgUnitId) q.set('orgUnitId', filters.orgUnitId)
    if (filters.projectId) q.set('projectId', filters.projectId)
    if (filters.actionId) q.set('actionId', filters.actionId)
    if (filters.assigneeId) q.set('assigneeId', filters.assigneeId)
    if (filters.status) q.set('status', filters.status)
    return q.toString()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp])

  const [data, setData] = useState(null)
  const [prev, setPrev] = useState(null) // kỳ trước — so sánh tab Action
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [drill, setDrill] = useState(null) // {title, bucket, extra:{orgUnitId?,actionId?}}

  const load = () => {
    setLoading(true); setError(null)
    apiFetch(`/reports/overview${query ? '?' + query : ''}`)
      .then(setData)
      .catch((e) => setError(e))
      .finally(() => setLoading(false))
    const pr = prevRange(range.from, range.to)
    if (pr) {
      const q2 = new URLSearchParams(query); q2.set('from', pr.from); q2.set('to', pr.to)
      apiFetch(`/reports/overview?${q2}`).then(setPrev).catch(() => setPrev(null))
    } else setPrev(null)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [query])

  if (!permissions.canViewReports) {
    return (
      <div className="page page-narrow">
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <AlertTriangle size={28} style={{ color: 'var(--text-muted)' }} />
          <h2 style={{ margin: '10px 0 6px' }}>Báo cáo tổng hợp dành cho quản lý</h2>
          <p className="muted">Cần vai trò tổ chức (TGĐ / Giám đốc khối / Trưởng đơn vị / Viewer) do quản trị viên gán.
            Việc cá nhân của bạn xem tại <Link className="link" to="/my-tasks">Việc của tôi</Link>.</p>
        </div>
      </div>
    )
  }

  const openDrill = (title, bucket, extra = {}) => setDrill({ title, bucket, extra })

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Báo cáo tổng hợp</h1>
          <p className="page-sub">
            {data ? <>Phạm vi: <strong>{data.scope.orgUnitCount}</strong> đơn vị theo quyền của bạn · cập nhật {new Date(data.generatedAt).toLocaleTimeString('vi')} · {data.range.from ? `${formatDate(data.range.from)} → ${formatDate(data.range.to)}` : 'toàn bộ thời gian'}</> : 'Đang tải…'}
          </p>
        </div>
        <button className="btn" onClick={load} title="Tải lại"><RefreshCw size={15} /></button>
      </div>

      {/* ── Bộ lọc chung ── */}
      <div className="filter-row" style={{ flexWrap: 'wrap' }}>
        <select value={preset} onChange={(e) => setParam({ preset: e.target.value, from: '', to: '' })}>
          {PRESETS.map((p) => <option key={p.key} value={p.key}>Kỳ: {p.label}</option>)}
        </select>
        {preset === 'custom' && (
          <>
            <input type="date" value={sp.get('from') || ''} onChange={(e) => setParam({ from: e.target.value })} />
            <input type="date" value={sp.get('to') || ''} onChange={(e) => setParam({ to: e.target.value })} />
          </>
        )}
        <select value={filters.orgUnitId} onChange={(e) => setParam({ org: e.target.value })}>
          <option value="">Đơn vị: Toàn phạm vi</option>
          {visibleDepartments.map((d) => <option key={d.id} value={d.id}>{orgUnitLabel(d)}</option>)}
        </select>
        <select value={filters.projectId} onChange={(e) => setParam({ project: e.target.value })}>
          <option value="">Dự án: Tất cả</option>
          {state.channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filters.actionId} onChange={(e) => setParam({ action: e.target.value })}>
          <option value="">Action: Tất cả</option>
          <option value="none">— Không thuộc Action —</option>
          {state.actions.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setParam({ status: e.target.value })}>
          <option value="">Trạng thái: Tất cả</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div style={{ minWidth: 200 }}>
          <SearchUser value={filters.assigneeId || null} autoFocus={false} placeholder="Người thực hiện…"
            onSelect={(id) => setParam({ assignee: id || '' })} />
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
        Quy tắc số liệu: task <strong>phát sinh</strong> tính theo ngày tạo · <strong>hoàn thành trong kỳ</strong> theo
        ngày hoàn thành · <strong>đang quá hạn / sắp đến hạn</strong> theo deadline và trạng thái tại thời điểm hiện tại.
        Task thuộc đồng thời Phòng ban + Dự án + Action chỉ được đếm MỘT lần.
      </p>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setParam({ tab: t.key })}>{t.label}</button>
        ))}
      </div>

      {error && (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <p className="form-error">Không tải được báo cáo: {error.message}</p>
          <button className="btn btn-primary" onClick={load}>Thử lại</button>
        </div>
      )}
      {loading && !error && (
        <div className="stat-grid">
          {[1, 2, 3, 4].map((i) => <div key={i} className="stat-card"><span className="stat-value muted">…</span><span className="stat-label">Đang tải</span></div>)}
        </div>
      )}

      {!loading && !error && data && tab === 'task' && <TaskTab data={data} hasRange={!!data.range.from} openDrill={openDrill} />}
      {!loading && !error && data && tab === 'action' && <ActionTab data={data} prev={prev} openDrill={openDrill} />}
      {!loading && !error && data && tab === 'org' && <OrgTab data={data} openDrill={openDrill} />}

      {drill && (
        <DrillDrawer
          drill={drill}
          baseQuery={query}
          onClose={() => setDrill(null)}
          onOpenTask={(id) => { setDrill(null); selectTask(id) }}
        />
      )}
    </div>
  )
}

function Card({ value, label, tone = '', onClick, sub }) {
  const cls = `stat-card ${tone} ${onClick ? 'clickable' : ''}`
  const inner = (
    <>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}{sub && <span className="muted"> · {sub}</span>}</span>
    </>
  )
  return onClick ? <button className={cls} onClick={onClick}>{inner}</button> : <div className={cls}>{inner}</div>
}

/* ══ TAB 1 — CÔNG VIỆC ══ */
function TaskTab({ data, hasRange, openDrill }) {
  const t = data.task
  const statusData = Object.entries(STATUS).map(([k, v]) => ({ label: v.label, value: t.byStatus[k] || 0, color: STATUS_COLORS[k] }))
  const topOrgOpen = data.byOrgUnit.map((o) => ({ label: orgUnitShortLabel({ name: o.orgUnitName, legalEntity: o.legalEntity }), value: o.total - o.done })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 10)
  const topOrgOverdue = data.byOrgUnit.map((o) => ({ label: orgUnitShortLabel({ name: o.orgUnitName, legalEntity: o.legalEntity }), value: o.overdue, color: '#e05b5b' })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 10)
  const topAssignees = data.topAssignees.map((a) => ({ user: a.user, label: a.user?.displayName || '—', value: a.open, sub: a.overdue }))
  return (
    <>
      <div className="stat-grid">
        <Card value={t.total} label={hasRange ? 'Task phát sinh trong kỳ' : 'Tổng task'} sub={hasRange ? 'theo ngày tạo' : null} tone="tone-blue" onClick={() => openDrill(hasRange ? 'Task phát sinh trong kỳ' : 'Tổng task', 'all')} />
        <Card value={t.active} label="Đang mở" tone="tone-amber" onClick={() => openDrill('Đang mở', 'active')} />
        <Card value={t.overdue} label="Đang quá hạn" sub="tại thời điểm hiện tại" tone="tone-red" onClick={() => openDrill('Đang quá hạn', 'overdue')} />
        <Card value={t.dueSoon} label={`Sắp đến hạn (${t.dueSoonDays} ngày)`} onClick={() => openDrill('Sắp đến hạn', 'dueSoon')} />
      </div>
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <Card value={t.byStatus.submitted} label="Chờ nghiệm thu" onClick={() => openDrill('Chờ nghiệm thu', 'submitted')} />
        <Card value={t.byStatus.returned} label="Bị trả lại" onClick={() => openDrill('Bị trả lại', 'returned')} />
        <Card value={t.byStatus.done} label="Hoàn thành" tone="tone-green" onClick={() => openDrill('Hoàn thành', 'done')} />
        <Card value={t.completedInRange} label="Hoàn thành trong kỳ" sub="theo ngày hoàn thành" onClick={() => openDrill('Hoàn thành trong kỳ', 'completedInRange')} />
      </div>
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <Card value={t.withProject} label="Có dự án" onClick={() => openDrill('Task có dự án', 'withProject')} />
        <Card value={t.withAction} label="Có Action" onClick={() => openDrill('Task có Action', 'withAction')} />
        <Card value={t.withoutAction} label="Không thuộc Action" onClick={() => openDrill('Không thuộc Action', 'noAction')} />
        <Card value={`${t.completionRate}%`} label="Tỷ lệ hoàn thành" sub={`quá hạn ${t.overdueRate}% việc mở`} />
      </div>
      <div className="chart-grid">
        <div className="card chart-card"><div className="card-head"><h2>Tỷ lệ hoàn thành</h2></div><Donut done={t.byStatus.done} total={t.total} label="done / tổng trong phạm vi lọc" /></div>
        <div className="card chart-card"><div className="card-head"><h2>Phân bổ theo trạng thái</h2></div><BarChart data={statusData} /></div>
        <div className="card chart-card"><div className="card-head"><h2>Xu hướng theo ngày</h2></div><TrendChart data={data.trend} /></div>
        <div className="card chart-card"><div className="card-head"><h2>Top người thực hiện (đang mở)</h2></div><HBarList data={topAssignees} emptyText="Không có việc đang mở" /></div>
        <div className="card chart-card"><div className="card-head"><h2>Top đơn vị — việc đang mở</h2></div><HBarList data={topOrgOpen} emptyText="Không có việc đang mở" /></div>
        <div className="card chart-card"><div className="card-head"><h2>Top đơn vị — đang quá hạn</h2></div><HBarList data={topOrgOverdue} color="#e05b5b" emptyText="Không đơn vị nào quá hạn 🎉" /></div>
      </div>
    </>
  )
}

/* ══ TAB 2 — ACTION LOG ══ */
function ActionTab({ data, prev, openDrill }) {
  const s = data.actionStats
  const delta = (cur, before) => {
    if (before == null) return null
    const d = cur - before
    return d === 0 ? '±0' : d > 0 ? `+${d}` : `${d}`
  }
  const prevS = prev?.actionStats
  const curRate = s.taskTotal ? Math.round((s.taskDone / s.taskTotal) * 100) : 0
  const prevRate = prevS?.taskTotal ? Math.round((prevS.taskDone / prevS.taskTotal) * 100) : null
  return (
    <>
      <div className="stat-grid">
        <Card value={s.total} label="Tổng Action trong kỳ" tone="tone-blue" sub={prevS ? `kỳ trước ${prevS.total} (${delta(s.total, prevS.total)})` : null} />
        <Card value={s.overdue} label="Action quá deadline" tone="tone-red" sub={prevS ? `kỳ trước ${prevS.overdue} (${delta(s.overdue, prevS.overdue)})` : null} />
        <Card value={s.withoutTask} label="Action chưa có task" sub="mới lập tiêu đề, chưa triển khai" />
        <Card value={`${curRate}%`} label="Task trong Action hoàn thành" tone="tone-green" sub={prevRate != null ? `kỳ trước ${prevRate}%` : `${s.taskDone}/${s.taskTotal} task`} />
      </div>
      <div className="stat-grid" style={{ marginTop: 10 }}>
        {Object.entries(ACTION_STATUS).map(([k, v]) => (
          <div key={k} className="stat-card"><span className="stat-value">{s.byStatus[k] || 0}</span><span className="stat-label">{v.label}</span></div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><h2>Bảng tổng hợp Action ({data.byAction.length})</h2></div>
        {data.byAction.length === 0 ? (
          <p className="muted" style={{ padding: 8 }}>Không có Action trong phạm vi/kỳ đã lọc.</p>
        ) : (
          <div className="table-wrap">
            <table className="task-table settings-table">
              <thead>
                <tr><th>Action</th><th>Đơn vị chủ trì</th><th>Phụ trách</th><th>Kỳ</th><th>Deadline</th><th>Trạng thái</th>
                  <th>Task</th><th>Xong</th><th>Mở</th><th>Quá hạn</th><th>% task xong</th></tr>
              </thead>
              <tbody>
                {data.byAction.map((a) => (
                  <tr key={a.actionId} className={a.overdue ? 'row-overdue' : ''}>
                    <td><Link className="link" to={`/actions/${a.actionId}`}>{a.title}</Link></td>
                    <td>{orgUnitShortLabel({ name: a.orgUnitName, legalEntity: a.legalEntity })}</td>
                    <td>{a.ownerName}</td>
                    <td>{a.period || '—'}</td>
                    <td className={a.overdue ? 'text-overdue' : ''}>{a.deadline ? formatDate(a.deadline) : '—'}</td>
                    <td><span className={`badge tone-${ACTION_STATUS[a.status]?.tone || 'gray'}`}>{ACTION_STATUS[a.status]?.label || a.status}</span></td>
                    <td><button className="link-btn" onClick={() => openDrill(`Task của "${a.title}"`, 'all', { actionId: a.actionId })}>{a.taskTotal}</button></td>
                    <td><button className="link-btn" onClick={() => openDrill(`Task hoàn thành — "${a.title}"`, 'done', { actionId: a.actionId })}>{a.taskDone}</button></td>
                    <td><button className="link-btn" onClick={() => openDrill(`Task đang mở — "${a.title}"`, 'active', { actionId: a.actionId })}>{a.taskOpen}</button></td>
                    <td><button className="link-btn text-overdue" onClick={() => openDrill(`Task quá hạn — "${a.title}"`, 'overdue', { actionId: a.actionId })}>{a.taskOverdue}</button></td>
                    <td>{a.taskCompletionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

/* ══ TAB 3 — PHÒNG BAN ══ */
function OrgTab({ data, openDrill }) {
  return (
    <div className="card" style={{ marginTop: 4 }}>
      <div className="card-head"><h2>Tổng hợp theo đơn vị chịu trách nhiệm ({data.byOrgUnit.length})</h2></div>
      <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
        Group theo Task.orgUnitId — mỗi task đếm đúng MỘT lần trong một đơn vị. Bấm số để xem danh sách task nguồn.
      </p>
      {data.byOrgUnit.length === 0 ? (
        <p className="muted" style={{ padding: 8 }}>Không có task trong phạm vi/kỳ đã lọc.</p>
      ) : (
        <div className="table-wrap">
          <table className="task-table settings-table">
            <thead>
              <tr><th>Đơn vị</th><th>Khối/Pháp nhân</th><th>Tổng</th><th>Chưa BĐ</th><th>Đang làm</th><th>Chờ NT</th>
                <th>Trả lại</th><th>Xong</th><th title='dueDate < hiện tại & chưa hoàn thành'>Đang quá hạn</th><th>Có DA</th><th>Có Action</th><th>%</th><th>Người mở</th><th>Action</th></tr>
            </thead>
            <tbody>
              {data.byOrgUnit.map((o) => {
                const D = (title, bucket) => openDrill(`${title} — ${o.orgUnitName}`, bucket, { orgUnitId: o.orgUnitId })
                return (
                  <tr key={o.orgUnitId}>
                    <td><Link className="link" to={`/departments/${o.orgUnitId}`}>{o.orgUnitName}</Link></td>
                    <td className="muted">{o.parentName || '—'}{o.legalEntity ? ` · ${legalEntityLabel(o.legalEntity)}` : ''}</td>
                    <td><button className="link-btn" onClick={() => D('Tổng task', 'all')}>{o.total}</button></td>
                    <td><button className="link-btn" onClick={() => D('Chưa bắt đầu', 'todo')}>{o.todo}</button></td>
                    <td><button className="link-btn" onClick={() => D('Đang làm', 'doing')}>{o.doing}</button></td>
                    <td><button className="link-btn" onClick={() => D('Chờ nghiệm thu', 'submitted')}>{o.submitted}</button></td>
                    <td><button className="link-btn" onClick={() => D('Bị trả lại', 'returned')}>{o.returned}</button></td>
                    <td><button className="link-btn" onClick={() => D('Hoàn thành', 'done')}>{o.done}</button></td>
                    <td><button className="link-btn text-overdue" onClick={() => D('Quá hạn', 'overdue')}>{o.overdue}</button></td>
                    <td><button className="link-btn" onClick={() => D('Có dự án', 'withProject')}>{o.withProject}</button></td>
                    <td><button className="link-btn" onClick={() => D('Có Action', 'withAction')}>{o.withAction}</button></td>
                    <td>{o.completionRate}%</td>
                    <td>{o.openAssignees}</td>
                    <td>{o.actionCount}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ══ DRILL-DOWN — danh sách task nguồn (paginate, giữ nguyên filter) ══ */
function DrillDrawer({ drill, baseQuery, onClose, onOpenTask }) {
  const [page, setPage] = useState(1)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    setErr(null)
    const q = new URLSearchParams(baseQuery)
    q.set('bucket', drill.bucket)
    q.set('page', String(page))
    q.set('pageSize', '20')
    if (drill.extra.orgUnitId) q.set('orgUnitId', drill.extra.orgUnitId)
    if (drill.extra.actionId) q.set('actionId', drill.extra.actionId)
    apiFetch(`/reports/tasks?${q}`).then(setRes).catch(setErr)
  }, [drill, baseQuery, page])

  const pages = res ? Math.max(1, Math.ceil(res.total / res.pageSize)) : 1
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 980, maxWidth: '96vw' }}>
        <div className="modal-head">
          <h2>{drill.title} {res && <span className="muted">({res.total})</span>}</h2>
          <button className="btn btn-ghost" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {err && <p className="form-error">Không tải được danh sách: {err.message}</p>}
          {!res && !err && <p className="muted">Đang tải…</p>}
          {res && res.rows.length === 0 && <p className="muted">Không có task nào khớp.</p>}
          {res && res.rows.length > 0 && (
            <div className="table-wrap">
              <table className="task-table settings-table">
                <thead>
                  <tr><th>Công việc</th><th>Đơn vị</th><th>Dự án</th><th>Action</th><th>Người thực hiện</th>
                    <th>Trạng thái</th><th>Deadline</th><th>Người nghiệm thu</th></tr>
                </thead>
                <tbody>
                  {res.rows.map((r) => (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => onOpenTask(r.id)}>
                      <td><span className="link">{r.title}</span>{r.overdue && <span className="badge tone-red" style={{ marginLeft: 6 }}>Quá hạn</span>}</td>
                      <td>{orgUnitShortLabel({ name: r.orgUnitName, legalEntity: r.legalEntity })}</td>
                      <td>{r.projectName || '—'}</td>
                      <td>{r.actionTitle || '—'}</td>
                      <td>{r.assignee ? <span className="cell-user"><Avatar user={r.assignee} size={20} /> {r.assignee.displayName}</span> : '—'}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className={r.overdue ? 'text-overdue' : ''}>{r.dueDate ? formatDate(r.dueDate) : '—'}</td>
                      <td>{r.reviewerName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Trang {page}/{pages}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
            <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button>
          </span>
        </div>
      </div>
    </div>
  )
}
