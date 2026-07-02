import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Dropdown render menu qua portal + position:fixed để không bị các container
// có overflow (bảng, panel chi tiết) cắt mất menu. Tự lật lên trên khi
// bên dưới không đủ chỗ.
export default function Dropdown({ trigger, children, align = 'left', menuClassName = '' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  // Đo menu sau khi render rồi mới định vị (render ẩn ở frame đầu)
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    const mh = menuRef.current?.offsetHeight || 0
    const mw = menuRef.current?.offsetWidth || 0
    if (!rect) return
    const openUp = rect.bottom + mh + 8 > window.innerHeight && rect.top - mh - 8 > 0
    const left = align === 'right'
      ? Math.max(8, rect.right - mw)
      : Math.min(rect.left, window.innerWidth - mw - 8)
    setPos({ top: openUp ? rect.top - mh - 4 : rect.bottom + 4, left })
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    // Menu định vị fixed nên phải đóng khi trang cuộn/resize
    const onScroll = (e) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return
      setOpen(false)
    }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  return (
    <>
      <div className="dropdown" ref={triggerRef}>
        <div
          className="dropdown-trigger"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        >
          {trigger}
        </div>
      </div>
      {open && createPortal(
        <div
          ref={menuRef}
          className={`dropdown-menu ${menuClassName}`}
          style={{
            position: 'fixed',
            zIndex: 200,
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            visibility: pos ? 'visible' : 'hidden',
          }}
          onClick={(e) => { e.stopPropagation(); setOpen(false) }}
        >
          {children}
        </div>,
        document.body
      )}
    </>
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
