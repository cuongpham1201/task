import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

/** items: [{ label, to? }] — phần tử cuối là trang hiện tại (không link). */
export default function Breadcrumb({ items }) {
  const list = (items || []).filter(Boolean)
  if (list.length === 0) return null
  return (
    <nav className="breadcrumb">
      {list.map((it, i) => (
        <span key={i} className="breadcrumb-item">
          {i > 0 && <ChevronRight size={13} className="breadcrumb-sep" />}
          {it.to && i < list.length - 1
            ? <Link to={it.to}>{it.label}</Link>
            : <span className="breadcrumb-current">{it.label}</span>}
        </span>
      ))}
    </nav>
  )
}
