import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import { isSameDay } from '../../utils/date'

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

// Lưới lịch tháng đơn giản, task hiển thị theo ngày deadline
export default function CalendarView({ tasks }) {
  const { selectTask } = useApp()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const shift = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))

  // Ngày đầu lưới: thứ Hai của tuần chứa ngày 1
  const first = new Date(month)
  const offset = (first.getDay() + 6) % 7
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - offset)

  const cells = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + i)
    return date
  })

  const today = new Date()
  const monthLabel = month.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button className="btn btn-ghost" onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
        <span className="calendar-month">{monthLabel}</span>
        <button className="btn btn-ghost" onClick={() => shift(1)}><ChevronRight size={16} /></button>
      </div>
      <div className="calendar-grid">
        {WEEKDAYS.map((w) => <div key={w} className="calendar-weekday">{w}</div>)}
        {cells.map((date, i) => {
          const inMonth = date.getMonth() === month.getMonth()
          const dayTasks = tasks.filter((t) => t.dueDate && isSameDay(t.dueDate, date))
          return (
            <div
              key={i}
              className={`calendar-cell ${inMonth ? '' : 'other-month'} ${isSameDay(date, today) ? 'today' : ''}`}
            >
              <span className="calendar-daynum">{date.getDate()}</span>
              {dayTasks.slice(0, 3).map((t) => (
                <button
                  key={t.id}
                  className={`calendar-task status-${t.status}`}
                  title={t.title}
                  onClick={() => selectTask(t.id)}
                >
                  {t.title}
                </button>
              ))}
              {dayTasks.length > 3 && (
                <span className="calendar-more">+{dayTasks.length - 3} việc khác</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
