import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useApp } from '../../store/AppContext'

export default function CreateProjectModal() {
  const { closeCreateProjectModal, createProject } = useApp()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    if (!name.trim()) { setError('Nhập tên dự án'); return }
    createProject({ name: name.trim(), description: description.trim() }, (ch) => {
      closeCreateProjectModal()
      navigate(`/channels/${ch.id}`)
    })
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && closeCreateProjectModal()}>
      <div className="modal">
        <div className="modal-head">
          <h2>Tạo dự án</h2>
          <button className="btn btn-ghost" onClick={closeCreateProjectModal}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <label className="form-field">
            <span>Tên dự án *</span>
            <input autoFocus placeholder="VD: Triển khai ERP 2026" value={name}
              onChange={(e) => { setName(e.target.value); setError('') }} />
            {error && <span className="form-error">{error}</span>}
          </label>
          <label className="form-field">
            <span>Mô tả</span>
            <textarea rows={3} placeholder="Dự án cộng tác cắt ngang phòng ban…" value={description}
              onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={closeCreateProjectModal}>Hủy</button>
          <button className="btn btn-primary" onClick={submit}>Tạo dự án</button>
        </div>
      </div>
    </div>
  )
}
