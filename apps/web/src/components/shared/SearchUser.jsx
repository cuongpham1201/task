import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from './Avatar'

/**
 * Picker người dùng dạng tìm kiếm (debounce) — thay dropdown 706 user.
 * Gọi /users/search, KHÔNG load toàn bộ. props:
 *  - value: userId đang chọn (hoặc null)
 *  - onSelect(userId, user|null)
 *  - orgUnitId?: giới hạn theo phòng
 */
export default function SearchUser({ value, onSelect, orgUnitId, placeholder = 'Tìm người…', autoFocus = true }) {
  const { searchUsers, usersById } = useApp()
  const selected = value ? usersById[value] : null
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const timer = useRef()

  useEffect(() => {
    if (!open) return
    clearTimeout(timer.current)
    // FEATURE-004: chỉ gợi ý KHI ĐÃ GÕ — focus không xổ sẵn danh sách
    if (!q.trim()) { setResults([]); setLoading(false); return }
    timer.current = setTimeout(() => {
      setLoading(true)
      searchUsers(q, { orgUnitId, limit: 20 })
        .then((r) => setResults(r || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open, orgUnitId])

  if (selected && !open) {
    return (
      <div className="searchuser-selected">
        <span className="cell-user"><Avatar user={selected} size={22} /> {selected.displayName}</span>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>Đổi</button>
      </div>
    )
  }

  return (
    <div className="searchuser">
      <div className="searchuser-input">
        <Search size={15} className="muted" />
        <input
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        {selected && (
          <button type="button" className="btn btn-ghost" title="Bỏ chọn" onClick={() => { onSelect(null); setOpen(false) }}><X size={14} /></button>
        )}
      </div>
      {open && q.trim() !== '' && (
        <div className="searchuser-results">
          {loading && <div className="searchuser-empty">Đang tìm…</div>}
          {!loading && results.length === 0 && <div className="searchuser-empty">Không tìm thấy</div>}
          {results.map((u) => (
            <button type="button" key={u.id} className="searchuser-item" onClick={() => { onSelect(u.id, u); setQ(''); setOpen(false) }}>
              <Avatar user={u} size={26} />
              <span className="searchuser-col">
                <span className="searchuser-name">{u.displayName}</span>
                <span className="muted searchuser-sub">{u.jobTitle || u.email}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
