import { useState } from 'react'

const COLORS = [
  '#7c6ce8', '#e8638c', '#e8842c', '#3f9be8',
  '#2eab6e', '#c05ecc', '#5b74e8', '#d9a514',
]

function initials(name) {
  const words = (name || '?').trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  // Tên tiếng Việt: lấy chữ cái đầu của họ và tên
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function colorOf(name) {
  let h = 0
  for (const ch of name || '?') h = (h * 31 + ch.charCodeAt(0)) % 997
  return COLORS[h % COLORS.length]
}

/**
 * Avatar dùng chung toàn app (BUG3): có user.avatarUrl (ảnh M365 cache từ Graph lúc
 * login) → render ảnh; lỗi tải/không có → fallback chữ cái đầu. Ảnh do API serve với
 * Cache-Control nên KHÔNG gọi Graph mỗi lần render.
 */
export default function Avatar({ user, size = 28, title }) {
  const [broken, setBroken] = useState(false)
  if (!user) return null
  const showImg = user.avatarUrl && !broken
  if (showImg) {
    return (
      <img
        className="avatar avatar-img"
        title={title ?? user.displayName}
        alt={user.displayName}
        src={user.avatarUrl}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        onError={() => setBroken(true)}
        loading="lazy"
      />
    )
  }
  return (
    <span
      className="avatar"
      title={title ?? user.displayName}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: colorOf(user.displayName),
      }}
    >
      {initials(user.displayName)}
    </span>
  )
}

export function AvatarGroup({ users, size = 26, max = 5 }) {
  const shown = users.slice(0, max)
  const rest = users.length - shown.length
  return (
    <span className="avatar-group">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} />
      ))}
      {rest > 0 && (
        <span className="avatar avatar-rest" style={{ width: size, height: size, fontSize: size * 0.38 }}>
          +{rest}
        </span>
      )}
    </span>
  )
}
