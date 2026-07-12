import { useEffect, useMemo, useState } from 'react'
import { Bell, Play, FlaskConical, RefreshCw, Save, RotateCcw, AlertTriangle } from 'lucide-react'
import { apiFetch } from '../../api/client'
import { useApp } from '../../store/AppContext'

/**
 * P1-4 — Cài đặt nhắc việc (Reminder Engine) — CHỈ Admin.
 * Nguồn config: DB override > ENV > DEFAULT (badge từng field). Backend là nguồn sự
 * thật + validate; form chỉ gửi field ĐÃ ĐỔI. Save và Run là 2 thao tác tách biệt.
 * Bật engine / chạy thật đều phải confirm (tạo notification THẬT).
 */
const SOURCE_BADGE = { database: ['DB', 'tone-purple'], env: ['ENV', 'tone-blue'], default: ['MẶC ĐỊNH', 'tone-gray'] }
const NUM_FIELDS = ['intervalMinutes', 'dueSoonDays', 'notStartedDays', 'reviewWaitDays', 'returnedWaitDays']

function SourceBadge({ source }) {
  const [label, tone] = SOURCE_BADGE[source] || [source, 'tone-gray']
  return <span className={`badge ${tone}`} title={`Nguồn giá trị: ${label}`}>{label}</span>
}

export default function ReminderSettings() {
  const { toast } = useApp()
  const [status, setStatus] = useState(null)
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [lastOp, setLastOp] = useState(null)
  const [error, setError] = useState(null)

  const load = async () => {
    setError(null)
    try {
      const [st, se] = await Promise.all([
        apiFetch('/admin/reminders/status'),
        apiFetch('/admin/reminders/settings'),
      ])
      setStatus(st); setSettings(se)
      setForm(Object.fromEntries(Object.entries(se.fields).map(([k, f]) => [k, f.value])))
    } catch (e) { setError(e) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  const dirty = useMemo(() => {
    if (!settings) return {}
    const d = {}
    for (const [k, f] of Object.entries(settings.fields)) {
      if (form[k] !== undefined && form[k] !== f.value) d[k] = form[k]
    }
    return d
  }, [form, settings])
  const isDirty = Object.keys(dirty).length > 0

  const save = async () => {
    if (!isDirty || busy) return
    // Bật engine → confirm bắt buộc, nêu rõ hậu quả (M3/H)
    if (dirty.enabled === true) {
      const lastDry = status?.lastRuns?.find((r) => r.dryRun)
      const hint = lastDry ? `\nDry-run gần nhất: ${lastDry.candidates} candidate.` : ''
      if (!window.confirm(
        `BẬT Reminder Engine?\n\nScheduler sẽ chạy mỗi ${form.intervalMinutes} phút (múi giờ ${form.timezone}) và TẠO THÔNG BÁO THẬT cho người dùng.${hint}\n\n(Bật engine chỉ bật scheduler — "Chạy ngay" là thao tác riêng.)`,
      )) return
    }
    if (dirty.enabled === false && !window.confirm('TẮT Reminder Engine? Scheduler dừng; lịch sử chạy và thông báo đã gửi được giữ nguyên.')) return
    setBusy(true)
    try {
      const r = await apiFetch('/admin/reminders/settings', { method: 'PATCH', body: JSON.stringify(dirty) })
      if (r.applied) toast(`Đã lưu và áp dụng ngay (${r.changed.join(', ')})`, 'success')
      else if (r.restartRequired) toast('Đã lưu config nhưng áp runtime lỗi — cần restart API', 'warn')
      else toast(r.reason || 'Không có thay đổi', 'warn')
      await load() // refresh — không giả trạng thái
    } catch (e) {
      toast(`Lưu thất bại: ${e.message}`) // save lỗi → không giả thành công
    } finally { setBusy(false) }
  }

  const runEngine = async (dryRun) => {
    if (busy) return
    if (!dryRun) {
      const off = status && !status.enabled
      if (!window.confirm(
        `CHẠY THẬT ngay bây giờ?\n\nSẽ tạo THÔNG BÁO THẬT cho người dùng (idempotent — không trùng mốc đã gửi).${off ? '\n\n⚠ Engine đang OFF — đây là lần chạy thủ công đặc biệt.' : ''}`,
      )) return
    }
    setBusy(true); setLastOp(null)
    try {
      const r = await apiFetch('/admin/reminders/run', { method: 'POST', body: JSON.stringify({ dryRun }) })
      setLastOp({ dryRun, ...r })
      toast(dryRun ? `Dry-run xong — ${r.wouldDeliver ?? 0} sẽ gửi (không ghi gì)` : `Đã chạy — gửi ${r.delivered}, trùng ${r.duplicate}`, 'success')
      await load()
    } catch (e) { toast(`Chạy thất bại: ${e.message}`) }
    finally { setBusy(false) }
  }

  if (error) {
    return <div className="card"><p className="form-error">Không tải được cài đặt nhắc việc: {error.message}</p>
      <button className="btn btn-primary" onClick={load}>Thử lại</button></div>
  }
  if (!status || !settings) return <div className="card"><p className="muted" style={{ padding: 8 }}>Đang tải cài đặt nhắc việc…</p></div>

  const f = settings.fields
  const lastRun = status.lastRuns?.[0]
  const runKind = (r) => (r.dryRun ? 'Dry-run' : r.trigger === 'manual' ? 'Thủ công' : 'Tự động')
  const runState = (r) => (r.failed > 0 ? (r.delivered > 0 ? 'partial' : 'failed') : 'success')

  return (
    <>
      {/* ── Status card ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <h2><Bell size={16} style={{ verticalAlign: -3 }} /> Trạng thái engine</h2>
          <button className="btn" disabled={busy} onClick={load} title="Làm mới"><RefreshCw size={15} /></button>
        </div>
        <p style={{ margin: 0 }}>
          {status.enabled ? <span className="badge tone-green">ĐANG BẬT</span> : <span className="badge tone-gray">ĐANG TẮT</span>}
          {' '}· chu kỳ <strong>{status.config.intervalMinutes} phút</strong> · múi giờ <strong>{status.config.timezone}</strong>
          {status.nextRunAt && <> · lần chạy kế tiếp ≈ <strong>{new Date(status.nextRunAt).toLocaleTimeString('vi')}</strong></>}
          {status.runningNow && <> · <span className="badge tone-amber">đang chạy…</span></>}
        </p>
        {lastRun && (
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
            Lần chạy gần nhất ({runKind(lastRun)} · {new Date(lastRun.startedAt).toLocaleString('vi')}):
            quét {lastRun.scanned} · candidate {lastRun.candidates} · gửi {lastRun.delivered} · trùng {lastRun.duplicate} · bỏ qua {lastRun.skipped} · lỗi {lastRun.failed} · {lastRun.durationMs}ms
          </p>
        )}
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
          {status.updatedAt
            ? <>Cấu hình cập nhật lần cuối: {new Date(status.updatedAt).toLocaleString('vi')}{status.updatedBy ? ` bởi ${status.updatedBy}` : ''}</>
            : 'Chưa có override nào — đang dùng giá trị ENV/mặc định.'}
        </p>
      </div>

      {/* ── Cảnh báo ── */}
      <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid var(--amber, #d9a514)' }}>
        <p style={{ margin: 0, fontSize: 13 }}>
          <AlertTriangle size={14} style={{ verticalAlign: -2 }} /> <strong>Production mặc định TẮT.</strong>{' '}
          Bật engine sẽ tạo thông báo thật cho người dùng theo chu kỳ. Dry-run không gửi gì.
          Lưu cấu hình và "Chạy ngay" là hai thao tác tách biệt — lưu KHÔNG tự chạy.
        </p>
      </div>

      {/* ── Configuration form ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head"><h2>Cấu hình</h2></div>
        <div className="reminder-form">
          <div className="reminder-field">
            <span className="reminder-label">{f.enabled.label} <SourceBadge source={f.enabled.source} /></span>
            <label className="review-toggle" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              <span><strong>{form.enabled ? 'Bật' : 'Tắt'}</strong><small>Bật = scheduler tự chạy theo chu kỳ; áp dụng ngay khi lưu (có xác nhận).</small></span>
            </label>
          </div>
          {NUM_FIELDS.map((k) => (
            <div key={k} className="reminder-field">
              <span className="reminder-label">
                {f[k].label} <SourceBadge source={f[k].source} />
                <small className="muted"> (mặc định {f[k].default}, {f[k].min}–{f[k].max})</small>
              </span>
              <input
                type="number" min={f[k].min} max={f[k].max} value={form[k] ?? ''}
                onChange={(e) => setForm({ ...form, [k]: e.target.value === '' ? f[k].value : Number(e.target.value) })}
                style={{ width: 110 }}
              />
              {(form[k] < f[k].min || form[k] > f[k].max) && (
                <span className="form-error">Phải trong khoảng {f[k].min}–{f[k].max}</span>
              )}
            </div>
          ))}
          <div className="reminder-field">
            <span className="reminder-label">{f.timezone.label} <SourceBadge source={f.timezone.source} /></span>
            <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
              {f.timezone.allowed.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div className="reminder-field">
            <span className="reminder-label">Escalation tới quản lý theo scope</span>
            <span className="badge tone-gray">Chưa triển khai (backlog P1-5)</span>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Ghi chú: ngưỡng "Action chưa có task" dùng CHUNG "{f.notStartedDays.label}". Mọi thay đổi áp dụng ngay
            khi lưu (không cần restart) và được ghi nhật ký quản trị.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" disabled={!isDirty || busy} onClick={save}>
            <Save size={15} /> Lưu {isDirty ? `(${Object.keys(dirty).length} thay đổi)` : ''}
          </button>
          <button className="btn" disabled={!isDirty || busy}
            onClick={() => setForm(Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.value])))}>
            <RotateCcw size={15} /> Hoàn tác
          </button>
        </div>
      </div>

      {/* ── Operations ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head"><h2>Thao tác</h2></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy} onClick={() => runEngine(true)}>
            <FlaskConical size={15} /> Dry-run (không gửi)
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => runEngine(false)}>
            <Play size={15} /> Chạy ngay (gửi thật)
          </button>
        </div>
        {lastOp && (
          <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
            {lastOp.dryRun ? 'Dry-run' : 'Chạy thật'} · runId <code>{(lastOp.runId || '').slice(0, 8)}</code> ·
            quét {lastOp.scanned} · candidate {lastOp.candidates} ·
            {lastOp.dryRun ? ` sẽ gửi ${lastOp.wouldDeliver ?? 0}` : ` đã gửi ${lastOp.delivered}`} ·
            trùng {lastOp.duplicate} · bỏ qua {lastOp.skipped} · lỗi {lastOp.failed}
          </p>
        )}
      </div>

      {/* ── Run history ── */}
      <div className="card">
        <div className="card-head"><h2>Lịch sử chạy ({status.lastRuns.length})</h2></div>
        {status.lastRuns.length === 0 ? (
          <p className="muted" style={{ padding: 8 }}>Chưa có lần chạy nào.</p>
        ) : (
          <div className="table-wrap">
            <table className="task-table settings-table">
              <thead>
                <tr><th>Thời gian</th><th>Loại</th><th>Quét</th><th>Candidate</th><th>Gửi</th><th>Trùng</th><th>Bỏ qua</th><th>Lỗi</th><th>ms</th><th>Kết quả</th></tr>
              </thead>
              <tbody>
                {status.lastRuns.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.startedAt).toLocaleString('vi')}</td>
                    <td>{r.dryRun ? <span className="badge tone-blue">Dry-run</span> : r.trigger === 'manual' ? <span className="badge tone-purple">Thủ công</span> : <span className="badge tone-gray">Tự động</span>}</td>
                    <td>{r.scanned}</td><td>{r.candidates}</td><td>{r.delivered}</td><td>{r.duplicate}</td><td>{r.skipped}</td>
                    <td className={r.failed > 0 ? 'text-overdue' : ''}>{r.failed}</td>
                    <td className="muted">{r.durationMs}</td>
                    <td>{runState(r) === 'success' ? <span className="badge tone-green">OK</span> : runState(r) === 'partial' ? <span className="badge tone-amber">Một phần</span> : <span className="badge tone-red">Lỗi</span>}</td>
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
