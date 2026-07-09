import { useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'

/**
 * Ô bình luận có @mention: gõ "@" + tên → gợi ý người dùng (autocomplete theo quyền);
 * chọn để chèn "@Tên" và lưu mention. onSubmit(text, mentionIds).
 */
export default function MentionCommentBox({ onSubmit, disabled }) {
  const { searchUsers } = useApp()
  const [text, setText] = useState('')
  const [mentions, setMentions] = useState([]) // [{id,name}]
  const [menu, setMenu] = useState(null) // {at, results}
  const timer = useRef()

  const onChange = (v) => {
    setText(v)
    const at = v.lastIndexOf('@')
    const after = at >= 0 ? v.slice(at + 1) : ''
    if (at >= 0 && !/\s/.test(after) && after.length <= 30) {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        searchUsers(after, { limit: 6 }).then((r) => setMenu({ at, results: r || [] })).catch(() => setMenu(null))
      }, 200)
    } else setMenu(null)
  }
  const pick = (u) => {
    setText(`${text.slice(0, menu.at)}@${u.displayName} `)
    setMentions((m) => (m.some((x) => x.id === u.id) ? m : [...m, { id: u.id, name: u.displayName }]))
    setMenu(null)
  }
  const submit = () => {
    const t = text.trim()
    if (!t) return
    const ids = mentions.filter((m) => text.includes('@' + m.name)).map((m) => m.id)
    onSubmit(t, ids)
    setText(''); setMentions([]); setMenu(null)
  }

  return (
    <div className="mention-box">
      <div className="comment-input">
        <input
          placeholder="Viết bình luận… (gõ @ để nhắc ai đó)"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !menu) { e.preventDefault(); submit() } }}
        />
        <button className="btn btn-primary" onClick={submit} disabled={disabled} title="Gửi"><Send size={16} /></button>
      </div>
      {menu && menu.results.length > 0 && (
        <div className="mention-menu">
          {menu.results.map((u) => (
            <button type="button" key={u.id} className="mention-item" onClick={() => pick(u)}>
              <Avatar user={u} size={20} /> <span>{u.displayName}</span> <span className="muted mention-mail">{u.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
