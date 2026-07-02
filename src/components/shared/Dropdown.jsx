import { useEffect, useRef, useState } from 'react'

// Dropdown chung: trigger là button, menu đóng khi click ra ngoài
export default function Dropdown({ trigger, children, align = 'left', menuClassName = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="dropdown" ref={ref}>
      <div
        className="dropdown-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
      >
        {trigger}
      </div>
      {open && (
        <div
          className={`dropdown-menu ${align === 'right' ? 'align-right' : ''} ${menuClassName}`}
          onClick={(e) => { e.stopPropagation(); setOpen(false) }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// Menu chọn 1 giá trị từ danh sách options [{ value, label, node? }]
export function SelectMenu({ value, options, onChange, renderTrigger }) {
  return (
    <Dropdown trigger={renderTrigger(value)}>
      {options.map((opt) => (
        <button
          key={opt.value ?? 'none'}
          className={`dropdown-item ${opt.value === value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.node ?? opt.label}
        </button>
      ))}
    </Dropdown>
  )
}
