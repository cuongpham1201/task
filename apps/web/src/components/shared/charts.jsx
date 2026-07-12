import { useMemo } from 'react'
import Avatar from './Avatar'
import { STATUS, ACTION_STATUS } from '../../data/constants'
import { SECTIONS, SECTION_ORDER } from '../../data/constants'
import { isOverdue } from '../../utils/date'

/**
 * FEATURE-005 — Dashboard biểu đồ kiểu Asana cho Phòng ban / Dự án / Action Log.
 * Chart thuần CSS/SVG (không thêm thư viện) — dữ liệu lấy từ state đã scope server.
 */

export const STATUS_COLORS = {
  todo: '#9aa1ad', doing: '#3f9be8', waiting: '#d9a514', submitted: '#e8842c',
  returned: '#e8638c', done: '#2eab6e', paused: '#b7b7c2',
}
const ACTION_COLORS = {
  draft: '#9aa1ad', in_progress: '#3f9be8', on_hold: '#d9a514',
  at_risk: '#e05b5b', done: '#2eab6e', cancelled: '#b7b7c2',
}

// ── Donut (SVG) ──
export function Donut({ done, total, size = 150, color = '#7c6ce8', track = 'var(--gray-soft, #eceef1)', label }) {
  const r = (size - 18) / 2
  const c = 2 * Math.PI * r
  const pct = total > 0 ? done / total : 0
  return (
    <div className="chart-donut">
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={16} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={16}
          strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="47%" textAnchor="middle" className="chart-donut-value">{total ? Math.round(pct * 100) + '%' : '—'}</text>
        <text x="50%" y="62%" textAnchor="middle" className="chart-donut-sub">{done}/{total}</text>
      </svg>
      {label && <p className="chart-caption">{label}</p>}
    </div>
  )
}

// ── Cột dọc ──
export function BarChart({ data, height = 150 }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="chart-bars" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="chart-bar-col" title={`${d.label}: ${d.value}`}>
          <span className="chart-bar-value">{d.value}</span>
          <span className="chart-bar-track">
            <span className="chart-bar-fill" style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0)}%`, background: d.color || 'var(--accent)' }} />
          </span>
          <span className="chart-bar-label" title={d.label}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Thanh ngang (tên dài: người, đơn vị) ──
export function HBarList({ data, color = 'var(--accent)', emptyText = 'Không có dữ liệu' }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  if (data.length === 0) return <p className="muted" style={{ fontSize: 13 }}>{emptyText}</p>
  return (
    <div className="chart-hbars">
      {data.map((d, i) => (
        <div key={i} className="chart-hbar-row" title={`${d.label}: ${d.value}`}>
          <span className="chart-hbar-label">
            {d.user && <Avatar user={d.user} size={18} />} {d.label}
          </span>
          <span className="chart-hbar-track">
            <span className="chart-hbar-fill" style={{ width: `${(d.value / max) * 100}%`, background: d.color || color }} />
          </span>
          <span className="chart-hbar-value">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Xu hướng theo ngày (SVG polyline — tạo mới / hoàn thành / trễ hạn) ──
export function TrendChart({ data, height = 160 }) {
  if (!data || data.length === 0) return <p className="muted" style={{ fontSize: 13 }}>Chưa có dữ liệu trong kỳ</p>
  const W = 560, H = height, PAD = 24
  const max = Math.max(...data.flatMap((d) => [d.created, d.completed, d.late]), 1)
  const x = (i) => PAD + (i * (W - PAD * 2)) / Math.max(data.length - 1, 1)
  const y = (v) => H - PAD - (v / max) * (H - PAD * 2)
  const line = (key) => data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ')
  const SERIES = [
    { key: 'created', label: 'Tạo mới', color: '#3f9be8' },
    { key: 'completed', label: 'Hoàn thành', color: '#2eab6e' },
    { key: 'late', label: 'Trễ hạn', color: '#e05b5b' },
  ]
  const lblEvery = Math.ceil(data.length / 6)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border)" />
        {SERIES.map((sr) => <path key={sr.key} d={line(sr.key)} fill="none" stroke={sr.color} strokeWidth="2" strokeLinejoin="round" />)}
        {data.map((d, i) => SERIES.map((sr) => d[sr.key] > 0 && (
          <circle key={sr.key + i} cx={x(i)} cy={y(d[sr.key])} r="2.5" fill={sr.color}>
            <title>{`${d.date}: ${sr.label} ${d[sr.key]}`}</title>
          </circle>
        )))}
        {data.map((d, i) => i % lblEvery === 0 && (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text-muted)' }}>
            {d.date.slice(5)}
          </text>
        ))}
      </svg>
      <p className="chart-caption" style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
        {SERIES.map((sr) => (
          <span key={sr.key}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: sr.color, marginRight: 4 }} />{sr.label}</span>
        ))}
      </p>
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="card chart-card">
      <div className="card-head"><h2>{title}</h2></div>
      {children}
    </div>
  )
}

// ══ Dashboard TASK (Phòng ban + Dự án) ══
export function TaskDashboard({ tasks, usersById, showSections = false }) {
  const m = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done')
    const done = tasks.filter((t) => t.status === 'done')
    const overdue = tasks.filter(isOverdue)
    const byStatus = Object.entries(STATUS).map(([k, v]) => ({
      label: v.label, value: tasks.filter((t) => t.status === k).length, color: STATUS_COLORS[k],
    }))
    const byDue = [
      { label: 'Sắp tới', value: open.filter((t) => t.dueDate && !isOverdue(t)).length, color: '#3f9be8' },
      { label: 'Quá hạn', value: overdue.length, color: '#e05b5b' },
      { label: 'Chưa đặt hạn', value: open.filter((t) => !t.dueDate).length, color: '#9aa1ad' },
      { label: 'Hoàn thành', value: done.length, color: '#2eab6e' },
    ]
    const perUser = {}
    for (const t of open) {
      if (!t.assigneeId) continue
      perUser[t.assigneeId] = (perUser[t.assigneeId] || 0) + 1
    }
    const byAssignee = Object.entries(perUser)
      .map(([id, value]) => ({ user: usersById[id], label: usersById[id]?.displayName || '—', value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
    const bySection = showSections
      ? [...SECTION_ORDER.map((k) => ({ label: SECTIONS[k], value: tasks.filter((t) => t.section === k).length, color: 'var(--accent)' })),
         { label: 'Chưa phân mục', value: tasks.filter((t) => !SECTION_ORDER.includes(t.section)).length, color: '#9aa1ad' }]
      : null
    return { open, done, overdue, byStatus, byDue, byAssignee, bySection }
  }, [tasks, usersById, showSections])

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card tone-blue"><span className="stat-value">{tasks.length}</span><span className="stat-label">Tổng công việc</span></div>
        <div className="stat-card tone-amber"><span className="stat-value">{m.open.length}</span><span className="stat-label">Đang mở</span></div>
        <div className="stat-card tone-red"><span className="stat-value">{m.overdue.length}</span><span className="stat-label">Quá hạn</span></div>
        <div className="stat-card tone-green"><span className="stat-value">{m.done.length}</span><span className="stat-label">Hoàn thành</span></div>
      </div>
      <div className="chart-grid">
        <ChartCard title="Tỷ lệ hoàn thành"><Donut done={m.done.length} total={tasks.length} label="Hoàn thành / tổng công việc" /></ChartCard>
        <ChartCard title="Theo trạng thái"><BarChart data={m.byStatus} /></ChartCard>
        <ChartCard title="Theo hạn hoàn thành"><BarChart data={m.byDue} /></ChartCard>
        <ChartCard title="Việc đang mở theo người thực hiện"><HBarList data={m.byAssignee} emptyText="Không có việc đang mở" /></ChartCard>
        {m.bySection && <ChartCard title="Theo mục"><BarChart data={m.bySection} /></ChartCard>}
      </div>
    </>
  )
}

// ══ Dashboard ACTION LOG ══
export function ActionDashboard({ actions, usersById, orgUnitsById }) {
  const m = useMemo(() => {
    const live = actions.filter((a) => !a.archived)
    const openStates = ['draft', 'in_progress', 'on_hold', 'at_risk']
    const open = live.filter((a) => openStates.includes(a.status))
    const done = live.filter((a) => a.status === 'done')
    const overdue = live.filter((a) => a.deadline && openStates.includes(a.status) && isOverdue({ dueDate: a.deadline, status: a.status }))
    const byStatus = Object.entries(ACTION_STATUS).map(([k, v]) => ({
      label: v.label, value: live.filter((a) => a.status === k).length, color: ACTION_COLORS[k],
    }))
    const perOrg = {}
    for (const a of open) perOrg[a.orgUnitId] = (perOrg[a.orgUnitId] || 0) + 1
    const byOrg = Object.entries(perOrg)
      .map(([id, value]) => ({ label: orgUnitsById[id]?.name || '—', value }))
      .sort((a, b) => b.value - a.value).slice(0, 10)
    const perOwner = {}
    for (const a of open) perOwner[a.ownerId] = (perOwner[a.ownerId] || 0) + 1
    const byOwner = Object.entries(perOwner)
      .map(([id, value]) => ({ user: usersById[id], label: usersById[id]?.displayName || '—', value }))
      .sort((a, b) => b.value - a.value).slice(0, 10)
    return { live, open, done, overdue, byStatus, byOrg, byOwner }
  }, [actions, usersById, orgUnitsById])

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card tone-blue"><span className="stat-value">{m.live.length}</span><span className="stat-label">Tổng Action</span></div>
        <div className="stat-card tone-amber"><span className="stat-value">{m.open.length}</span><span className="stat-label">Đang mở</span></div>
        <div className="stat-card tone-red"><span className="stat-value">{m.overdue.length}</span><span className="stat-label">Quá deadline</span></div>
        <div className="stat-card tone-green"><span className="stat-value">{m.done.length}</span><span className="stat-label">Hoàn thành</span></div>
      </div>
      <div className="chart-grid">
        <ChartCard title="Tỷ lệ hoàn thành"><Donut done={m.done.length} total={m.live.length} label="Action hoàn thành / tổng" /></ChartCard>
        <ChartCard title="Theo trạng thái"><BarChart data={m.byStatus} /></ChartCard>
        <ChartCard title="Action đang mở theo đơn vị"><HBarList data={m.byOrg} emptyText="Không có action đang mở" /></ChartCard>
        <ChartCard title="Action đang mở theo owner"><HBarList data={m.byOwner} emptyText="Không có action đang mở" /></ChartCard>
      </div>
    </>
  )
}
