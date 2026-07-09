import { useEffect, useState } from 'react'

// State đồng bộ localStorage — dùng cho "saved view" cá nhân (item 17).
export function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s !== null ? JSON.parse(s) : initial } catch { return initial }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore */ }
  }, [key, val])
  return [val, setVal]
}

// Recent items (item 18): task/action/project vừa mở.
const RKEY = 'giaoviec.recent'
export function pushRecent(item) {
  try {
    const list = JSON.parse(localStorage.getItem(RKEY) || '[]')
    const next = [{ ...item, at: Date.now() }, ...list.filter((x) => !(x.type === item.type && x.id === item.id))].slice(0, 8)
    localStorage.setItem(RKEY, JSON.stringify(next))
  } catch { /* ignore */ }
}
export function getRecent() {
  try { return JSON.parse(localStorage.getItem(RKEY) || '[]') } catch { return [] }
}
