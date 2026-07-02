import { useEffect, useState } from 'react'
import { X, CheckCircle2, Circle, Plus, Send, CalendarDays } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'
import { StatusSelect, PrioritySelect } from '../shared/badges'
import { SelectMenu } from '../shared/Dropdown'
import { toInputDate, fromInputDate, timeAgo, formatDateFull } from '../../utils/date'
import { activityText } from '../../utils/activity'

function Field({ label, children }) {
  return (
    <div className="detail-field">
      <span className="detail-label">{label}</span>
      <div className="detail-value">{children}</div>
    </div>
  )
}

function AssigneeSelect({ value, onChange }) {
  const { state, usersById } = useApp()
  const user = usersById[value]
  return (
    <SelectMenu
      value={value}
      onChange={onChange}
      options={state.users.map((u) => ({
        value: u.id,
        node: (
          <span className="cell-user">
            <Avatar user={u} size={22} /> {u.displayName}
          </span>
        ),
      }))}
      renderTrigger={() => (
        <button className="detail-user-btn">
          {user ? (
            <span className="cell-user"><Avatar user={user} size={24} /> {user.displayName}</span>
          ) : 'Chọn người phụ trách'}
        </button>
      )}
    />
  )
}

export default function TaskDetailPanel() {
  const {
    state, usersById, getTask, getSubtasks, getComments, getActivities,
    selectTask, updateTask, setStatus, setProgress, toggleComplete,
    addComment, toggleSubtask, addSubtask, taskContextLabel,
  } = useApp()

  const task = state.selectedTaskId ? getTask(state.selectedTaskId) : null
  const [description, setDescription] = useState('')
  const [progressLocal, setProgressLocal] = useState(0)
  const [commentText, setCommentText] = useState('')
  const [newSubtask, setNewSubtask] = useState('')
  const [tab, setTab] = useState('comments')

  useEffect(() => {
    if (task) {
      setDescription(task.description || '')
      setProgressLocal(task.progress || 0)
      setCommentText('')
      setNewSubtask('')
      setTab('comments')
    }
    // Chỉ reset khi mở task khác
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id])

  if (!task) return null

  const subs = getSubtasks(task.id)
  const comments = getComments(task.id)
  const acts = getActivities(task.id)
  const creator = usersById[task.creatorId]
  const isDone = task.status === 'done'

  const submitComment = () => {
    const text = commentText.trim()
    if (!text) return
    addComment(task.id, text)
    setCommentText('')
  }

  const submitSubtask = () => {
    const title = newSubtask.trim()
    if (!title) return
    addSubtask(task.id, title)
    setNewSubtask('')
  }

  return (
    <>
      <div className="panel-overlay" onClick={() => selectTask(null)} />
      <aside className="detail-panel">
        <div className="detail-head">
          <button
            className={`btn btn-complete ${isDone ? 'is-done' : ''}`}
            onClick={() => toggleComplete(task)}
          >
            {isDone ? <CheckCircle2 size={15} /> : <Circle size={15} />}
            {isDone ? 'Đã hoàn thành' : 'Đánh dấu hoàn thành'}
          </button>
          <button className="btn btn-ghost" onClick={() => selectTask(null)} title="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="detail-body">
          <h2 className={`detail-title ${isDone ? 'done' : ''}`}>{task.title}</h2>

          <div className="detail-fields">
            <Field label="Người giao">
              {creator && (
                <span className="cell-user"><Avatar user={creator} size={24} /> {creator.displayName}</span>
              )}
            </Field>
            <Field label="Người phụ trách">
              <AssigneeSelect
                value={task.assigneeId}
                onChange={(id) => updateTask(task.id, { assigneeId: id })}
              />
            </Field>
            <Field label="Người phối hợp">
              {task.collaboratorIds.length === 0 ? (
                <span className="muted">Không có</span>
              ) : (
                <span className="collab-list">
                  {task.collaboratorIds.map((id) => {
                    const u = usersById[id]
                    return u && (
                      <span key={id} className="cell-user small">
                        <Avatar user={u} size={20} /> {u.displayName}
                      </span>
                    )
                  })}
                </span>
              )}
            </Field>
            <Field label="Phòng ban / Channel">{taskContextLabel(task)}</Field>
            <Field label="Trạng thái">
              <StatusSelect value={task.status} onChange={(s) => setStatus(task.id, s)} />
            </Field>
            <Field label="Độ ưu tiên">
              <PrioritySelect
                value={task.priority}
                onChange={(p) => updateTask(task.id, { priority: p })}
              />
            </Field>
            <Field label="Ngày bắt đầu">
              <span className="date-input-wrap">
                <CalendarDays size={14} />
                <input
                  type="date"
                  value={toInputDate(task.startDate)}
                  onChange={(e) => updateTask(task.id, { startDate: fromInputDate(e.target.value) })}
                />
              </span>
            </Field>
            <Field label="Deadline">
              <span className="date-input-wrap">
                <CalendarDays size={14} />
                <input
                  type="date"
                  value={toInputDate(task.dueDate)}
                  onChange={(e) => updateTask(task.id, { dueDate: fromInputDate(e.target.value) })}
                />
              </span>
            </Field>
            <Field label="Tiến độ">
              <span className="progress-edit">
                <input
                  type="range"
                  min="0" max="100" step="5"
                  value={progressLocal}
                  onChange={(e) => setProgressLocal(Number(e.target.value))}
                  onMouseUp={() => setProgress(task.id, progressLocal)}
                  onTouchEnd={() => setProgress(task.id, progressLocal)}
                />
                <span className="progress-label">{progressLocal}%</span>
              </span>
            </Field>
          </div>

          <div className="detail-section">
            <h3>Mô tả</h3>
            <textarea
              className="detail-desc"
              placeholder="Thêm mô tả chi tiết…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                if (description !== task.description) {
                  updateTask(task.id, { description })
                }
              }}
              rows={3}
            />
          </div>

          <div className="detail-section">
            <h3>Việc con ({subs.filter((s) => s.done).length}/{subs.length})</h3>
            <div className="subtask-list">
              {subs.map((s) => (
                <label key={s.id} className={`subtask-item ${s.done ? 'done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={s.done}
                    onChange={() => toggleSubtask(s.id)}
                  />
                  <span className="subtask-title">{s.title}</span>
                  {s.assigneeId && usersById[s.assigneeId] && (
                    <Avatar user={usersById[s.assigneeId]} size={20} />
                  )}
                </label>
              ))}
            </div>
            <div className="subtask-add">
              <Plus size={15} />
              <input
                placeholder="Thêm việc con…"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitSubtask()}
              />
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-tabs">
              <button
                className={`tab ${tab === 'comments' ? 'active' : ''}`}
                onClick={() => setTab('comments')}
              >
                Bình luận ({comments.length})
              </button>
              <button
                className={`tab ${tab === 'activity' ? 'active' : ''}`}
                onClick={() => setTab('activity')}
              >
                Hoạt động
              </button>
            </div>

            {tab === 'comments' ? (
              <div className="comment-list">
                {comments.length === 0 && <p className="muted">Chưa có bình luận nào.</p>}
                {comments.map((c) => {
                  const u = usersById[c.userId]
                  return (
                    <div key={c.id} className="comment">
                      <Avatar user={u} size={28} />
                      <div className="comment-body">
                        <div className="comment-head">
                          <strong>{u?.displayName}</strong>
                          <span className="muted" title={formatDateFull(c.createdAt)}>
                            {timeAgo(c.createdAt)}
                          </span>
                        </div>
                        <p>{c.content}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="activity-list">
                {acts.length === 0 && <p className="muted">Chưa có hoạt động nào.</p>}
                {acts.map((a) => {
                  const u = usersById[a.userId]
                  return (
                    <div key={a.id} className="activity-item">
                      <Avatar user={u} size={22} />
                      <span>
                        <strong>{u?.displayName}</strong> {activityText(a, usersById)}
                      </span>
                      <span className="muted">{timeAgo(a.createdAt)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="comment-input">
          <input
            placeholder="Viết bình luận…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitComment()}
          />
          <button className="btn btn-primary" onClick={submitComment} title="Gửi">
            <Send size={15} />
          </button>
        </div>
      </aside>
    </>
  )
}
