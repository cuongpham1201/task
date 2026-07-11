import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import { isSameDay } from '../../utils/date'

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const DAY = 86400000
const LANE_H = 24 // px mỗi làn task
const MAX_LANES = 5 // quá → gom "+n việc khác"

// Màu ổn định theo task (cùng màu xuyên suốt các tuần)
const BAR_COLORS = ['#7c6ce8', '#3f9be8', '#2eab6e', '#e8842c', '#e8638c', '#c05ecc', '#5b74e8', '#d9a514']
function barColor(id) {
  let h = 0
  for (const ch of id || '?') h = (h * 31 + ch.charCodeAt(0)) % 997
  return BAR_COLORS[h % BAR_COLORS.length]
}

const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

// Khoảng hiển thị của task: startDate → dueDate (thiếu đầu nào lấy đầu kia — 1 ngày)
function taskRange(t) {
  const s = t.startDate ? dayStart(t.startDate) : null
  const e = t.dueDate ? dayStart(t.dueDate) : null
  if (!s && !e) return null
  const start = s ?? e
  const end = e ?? s
  return end < start ? { start: end, end: start } : { start, end }
}

/**
 * FEATURE-004: lịch tháng kiểu thanh kéo dài (Google Calendar) — mỗi task là MỘT
 * thanh cùng màu nối từ ngày bắt đầu tới deadline, chạy xuyên tuần; nhiều task
 * xếp làn chồng nhau, quá 5 làn/tuần gom thành "+n việc khác".
 */
export default function CalendarView({ tasks }) {
  const { selectTask } = useApp()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const shift = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))

  // Lưới: 6 tuần bắt đầu từ thứ Hai của tuần chứa ngày 1
  const first = new Date(month)
  const offset = (first.getDay() + 6) % 7
  const gridStart = dayStart(new Date(first.getFullYear(), first.getMonth(), first.getDate() - offset))
  const today = new Date()
  const monthLabel = month.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })

  const weeks = useMemo(() => {
    const ranged = tasks
      .map((t) => ({ t, r: taskRange(t) }))
      .filter((x) => x.r)
      .sort((a, b) => a.r.start - b.r.start || (b.r.end - b.r.start) - (a.r.end - a.r.start))

    return Array.from({ length: 6 }, (_, w) => {
      const weekStart = new Date(gridStart.getTime() + w * 7 * DAY)
      const weekEnd = new Date(weekStart.getTime() + 6 * DAY)
      const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY))

      // Cắt các task giao với tuần này thành segment [col1..col2]
      const segs = []
      for (const { t, r } of ranged) {
        if (r.end < weekStart || r.start > weekEnd) continue
        const from = r.start > weekStart ? r.start : weekStart
        const to = r.end < weekEnd ? r.end : weekEnd
        segs.push({
          task: t,
          col1: Math.round((from - weekStart) / DAY),
          col2: Math.round((to - weekStart) / DAY),
          isStart: r.start >= weekStart,
          isEnd: r.end <= weekEnd,
        })
      }
      // Xếp làn: segment vào làn trống đầu tiên không đè cột nào
      const lanes = []
      let hidden = 0
      for (const seg of segs) {
        let lane = lanes.findIndex((cols) => !cols.some((c) => c >= seg.col1 && c <= seg.col2))
        if (lane === -1) {
          if (lanes.length >= MAX_LANES) { hidden++; continue }
          lanes.push([])
          lane = lanes.length - 1
        }
        for (let c = seg.col1; c <= seg.col2; c++) lanes[lane].push(c)
        seg.lane = lane
      }
      return { days, segs: segs.filter((s) => s.lane !== undefined), laneCount: lanes.length, hidden }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, gridStart.getTime()])

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button className="btn btn-ghost" onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
        <span className="calendar-month">{monthLabel}</span>
        <button className="btn btn-ghost" onClick={() => shift(1)}><ChevronRight size={16} /></button>
      </div>

      <div className="cal-weekdays">
        {WEEKDAYS.map((w) => <div key={w} className="calendar-weekday">{w}</div>)}
      </div>

      {weeks.map((week, wi) => (
        <div key={wi} className="cal-week" style={{ minHeight: 34 + Math.max(week.laneCount, 1) * LANE_H + (week.hidden ? 18 : 0) }}>
          {week.days.map((date, di) => {
            const inMonth = date.getMonth() === month.getMonth()
            return (
              <div key={di} className={`cal-day ${inMonth ? '' : 'other-month'} ${isSameDay(date, today) ? 'today' : ''}`}>
                <span className="calendar-daynum">{date.getDate()}</span>
              </div>
            )
          })}
          {week.segs.map((seg, si) => (
            <button
              key={`${seg.task.id}-${si}`}
              className={`cal-bar ${seg.isStart ? 'is-start' : ''} ${seg.isEnd ? 'is-end' : ''} ${seg.task.status === 'done' ? 'is-done' : ''}`}
              style={{
                left: `calc(${(seg.col1 / 7) * 100}% + 3px)`,
                width: `calc(${((seg.col2 - seg.col1 + 1) / 7) * 100}% - 6px)`,
                top: 30 + seg.lane * LANE_H,
                background: barColor(seg.task.id),
              }}
              title={`${seg.task.title}${seg.task.startDate ? ' · bắt đầu ' + new Date(seg.task.startDate).toLocaleDateString('vi') : ''}${seg.task.dueDate ? ' · hạn ' + new Date(seg.task.dueDate).toLocaleDateString('vi') : ''}`}
              onClick={() => selectTask(seg.task.id)}
            >
              {(seg.isStart || seg.col1 === 0) ? seg.task.title : '…' + seg.task.title}
            </button>
          ))}
          {week.hidden > 0 && (
            <span className="cal-hidden">+{week.hidden} việc khác</span>
          )}
        </div>
      ))}

      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Mỗi thanh chạy từ ngày bắt đầu đến deadline (task chỉ có deadline hiển thị 1 ngày). Bấm vào thanh để mở chi tiết.
      </p>
    </div>
  )
}
