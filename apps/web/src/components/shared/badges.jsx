import { STATUS, STATUS_ORDER, PRIORITY, PRIORITY_ORDER } from '../../data/constants'
import { SelectMenu } from './Dropdown'

export function StatusBadge({ status }) {
  return <span className={`badge status-${status}`}>{STATUS[status]?.label || status}</span>
}

export function PriorityBadge({ priority }) {
  return <span className={`badge priority-${priority}`}>{PRIORITY[priority]?.label || priority}</span>
}

// Badge trạng thái có thể click để đổi
export function StatusSelect({ value, onChange }) {
  return (
    <SelectMenu
      value={value}
      onChange={onChange}
      options={STATUS_ORDER.map((s) => ({
        value: s,
        node: <StatusBadge status={s} />,
      }))}
      renderTrigger={(v) => (
        <span className="badge-clickable"><StatusBadge status={v} /></span>
      )}
    />
  )
}

export function PrioritySelect({ value, onChange }) {
  return (
    <SelectMenu
      value={value}
      onChange={onChange}
      options={PRIORITY_ORDER.map((p) => ({
        value: p,
        node: <PriorityBadge priority={p} />,
      }))}
      renderTrigger={(v) => (
        <span className="badge-clickable"><PriorityBadge priority={v} /></span>
      )}
    />
  )
}
