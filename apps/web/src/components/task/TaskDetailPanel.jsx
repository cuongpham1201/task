import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  X, CheckCircle2, Circle, Plus, Send, CalendarDays, ThumbsUp, Undo2, Pencil, Trash2,
} from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'
import { StatusBadge, PriorityBadge, StatusSelect, PrioritySelect } from '../shared/badges'
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
          ) : 'Chọn người thực hiện'}
        </button>
      )}
    />
  )
}

export default function TaskDetailPanel() {
  const {
    state, usersById, currentUser, perms, getTask, getSubtasks, getComments, getActivities,
    selectTask, updateTaskField, setStatus, setProgress, toggleComplete,
    assignTask, setDueDate, setPriority, submitTask, reviewTask,
    addComment, toggleSubtask, addSubtask, taskContextLabel,
    archiveTask, updateSubtask, deleteSubtask, editComment, deleteComment,
    actionsById, channelsById, orgUnitName,
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

  // Đồng bộ progress hiển thị khi task đổi từ nơi khác (VD: tick hoàn thành)
  useEffect(() => {
    if (task) setProgressLocal(task.progress || 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.progress])

  if (!task) return null

  const subs = getSubtasks(task.id)
  const comments = getComments(task.id)
  const acts = getActivities(task.id)
  const creator = usersById[task.creatorId]
  const assignee = usersById[task.assigneeId]
  const isDone = task.status === 'done'

  // Phân quyền: quyết định control nào được thao tác
  const canStatus = perms.updateStatus(task)
  const canManage = perms.manage(task)
  const canSubs = perms.subtasks(task)
  const canCmt = perms.comment(task)
  const reviewRequired = task.reviewRequired ?? (task.completionMode === 'review_required')
  const canReview = perms.review(task)

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
          {reviewRequired && task.status === 'submitted' && canReview ? (
            <div className="review-actions">
              <button className="btn btn-primary btn-complete" onClick={() => reviewTask(task.id, 'passed')}>
                <ThumbsUp size={15} /> Nghiệm thu Đạt
              </button>
              <button
                className="btn btn-complete"
                onClick={() => reviewTask(task.id, 'returned', window.prompt('Lý do trả lại (tuỳ chọn):') || '')}
              >
                <Undo2 size={15} /> Trả lại
              </button>
            </div>
          ) : reviewRequired && task.status === 'submitted' ? (
            <span className="review-pending">⏳ Chờ nghiệm thu</span>
          ) : reviewRequired && !isDone && task.assigneeId === currentUser?.id ? (
            <button className="btn btn-primary btn-complete" onClick={() => submitTask(task.id)}>
              <Send size={15} /> Nộp nghiệm thu
            </button>
          ) : (
            <button
              className={`btn btn-complete ${isDone ? 'is-done' : ''}`}
              disabled={!canStatus}
              title={canStatus ? '' : 'Bạn không có quyền cập nhật task này'}
              onClick={() => toggleComplete(task)}
            >
              {isDone ? <CheckCircle2 size={15} /> : <Circle size={15} />}
              {isDone ? 'Đã hoàn thành' : 'Đánh dấu hoàn thành'}
            </button>
          )}
          <span className="detail-head-actions">
            {canManage && (
              <button
                className="btn btn-ghost"
                title="Xóa công việc"
                onClick={() => {
                  if (window.confirm(`Xóa công việc "${task.title}"?`)) archiveTask(task.id)
                }}
              >
                <Trash2 size={17} />
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => selectTask(null)} title="Đóng">
              <X size={18} />
            </button>
          </span>
        </div>

        <div className="detail-body">
          <h2 className={`detail-title ${isDone ? 'done' : ''}`}>
            {task.title}
            {canManage && (
              <button
                className="btn btn-ghost title-edit"
                title="Sửa tên công việc"
                onClick={() => {
                  const t = window.prompt('Tên công việc:', task.title)
                  if (t && t.trim() && t.trim() !== task.title) {
                    updateTaskField(task.id, { title: t.trim() })
                  }
                }}
              >
                <Pencil size={14} />
              </button>
            )}
          </h2>

          <h3 className="detail-group-title">Nguồn giao việc</h3>
          <div className="detail-fields">
            <Field label="Người giao">
              {creator && (
                <span className="cell-user"><Avatar user={creator} size={24} /> {creator.displayName}</span>
              )}
            </Field>
            <Field label="Người thực hiện">
              {canManage ? (
                <AssigneeSelect
                  value={task.assigneeId}
                  onChange={(id) => assignTask(task.id, id)}
                />
              ) : (
                assignee && (
                  <span className="cell-user"><Avatar user={assignee} size={24} /> {assignee.displayName}</span>
                )
              )}
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
            <Field label="Đơn vị yêu cầu">{task.orgUnitName || taskContextLabel(task)}</Field>
            <Field label="Đơn vị thực hiện">{assignee?.orgUnitId ? (orgUnitName(assignee.orgUnitId) || '—') : '—'}</Field>
            {task.projectId && (
              <Field label="Dự án">{channelsById[task.projectId]?.name || '—'}</Field>
            )}
            {task.actionId && (
              <Field label="Action">
                <Link className="link" to={`/actions/${task.actionId}`} onClick={() => selectTask(null)}>
                  {task.actionTitle || actionsById[task.actionId]?.title || 'Xem Action'}
                </Link>
              </Field>
            )}
          </div>

          <h3 className="detail-group-title">Chi tiết công việc</h3>
          <div className="detail-fields">
            <Field label="Nghiệm thu">{reviewRequired ? 'Cần nghiệm thu' : 'Tự hoàn thành'}</Field>
            {task.isScorable && (
              <Field label="KPI">
                <span className="badge tone-purple">Tính KPI</span>
                {task.kpiWeight != null && <span className="muted"> · trọng số {task.kpiWeight}</span>}
                {task.acceptedAt && <span className="muted"> · đã nghiệm thu {formatDateFull(task.acceptedAt)}</span>}
              </Field>
            )}
            <Field label="Trạng thái">
              {/* Chờ nghiệm thu → khóa đổi tay; chuyển bằng nút Đạt/Trả lại */}
              {canStatus && task.status !== 'submitted' ? (
                <StatusSelect value={task.status} onChange={(s) => setStatus(task.id, s)} />
              ) : (
                <StatusBadge status={task.status} />
              )}
            </Field>
            <Field label="Độ ưu tiên">
              {canManage ? (
                <PrioritySelect
                  value={task.priority}
                  onChange={(p) => setPriority(task.id, p)}
                />
              ) : (
                <PriorityBadge priority={task.priority} />
              )}
            </Field>
            <Field label="Ngày bắt đầu">
              <span className="date-input-wrap">
                <CalendarDays size={14} />
                <input
                  type="date"
                  disabled={!canManage}
                  value={toInputDate(task.startDate)}
                  onChange={(e) => updateTaskField(task.id, { startDate: fromInputDate(e.target.value) })}
                />
              </span>
            </Field>
            <Field label="Deadline">
              <span className="date-input-wrap">
                <CalendarDays size={14} />
                <input
                  type="date"
                  disabled={!canManage}
                  value={toInputDate(task.dueDate)}
                  onChange={(e) => setDueDate(task.id, fromInputDate(e.target.value))}
                />
              </span>
            </Field>
            <Field label="Tiến độ">
              <span className="progress-edit">
                <input
                  type="range"
                  min="0" max="100" step="5"
                  disabled={!canStatus}
                  value={progressLocal}
                  onChange={(e) => setProgressLocal(Number(e.target.value))}
                  onMouseUp={() => setProgress(task.id, progressLocal)}
                  onTouchEnd={() => setProgress(task.id, progressLocal)}
                  onKeyUp={() => setProgress(task.id, progressLocal)}
                />
                <span className="progress-label">{progressLocal}%</span>
              </span>
            </Field>
          </div>

          <div className="detail-section">
            <h3>Mô tả</h3>
            <textarea
              className="detail-desc"
              placeholder={canStatus ? 'Thêm mô tả chi tiết…' : 'Không có mô tả'}
              readOnly={!canStatus}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                if (canStatus && description !== task.description) {
                  updateTaskField(task.id, { description })
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
                    disabled={!canSubs}
                    onChange={() => toggleSubtask(s.id)}
                  />
                  <span className="subtask-title">{s.title}</span>
                  {s.assigneeId && usersById[s.assigneeId] && (
                    <Avatar user={usersById[s.assigneeId]} size={20} />
                  )}
                  {canSubs && (
                    <button
                      type="button"
                      className="btn btn-ghost row-action"
                      title="Sửa việc con"
                      onClick={(e) => {
                        e.preventDefault()
                        const t = window.prompt('Tên việc con:', s.title)
                        if (t && t.trim() && t.trim() !== s.title) updateSubtask(s.id, { title: t.trim() })
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      className="btn btn-ghost row-action"
                      title="Xóa việc con"
                      onClick={(e) => {
                        e.preventDefault()
                        if (window.confirm(`Xóa việc con "${s.title}"?`)) deleteSubtask(s.id)
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </label>
              ))}
            </div>
            {canSubs && (
              <div className="subtask-add">
                <Plus size={15} />
                <input
                  placeholder="Thêm việc con…"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitSubtask()}
                />
              </div>
            )}
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
                  const own = c.userId === currentUser?.id
                  return (
                    <div key={c.id} className="comment">
                      <Avatar user={u} size={28} />
                      <div className="comment-body">
                        <div className="comment-head">
                          <strong>{u?.displayName}</strong>
                          <span className="comment-head-right">
                            <span className="muted" title={formatDateFull(c.createdAt)}>
                              {c.updatedAt ? 'đã sửa · ' : ''}{timeAgo(c.createdAt)}
                            </span>
                            {own && (
                              <>
                                <button
                                  className="btn btn-ghost row-action"
                                  title="Sửa bình luận"
                                  onClick={() => {
                                    const t = window.prompt('Sửa bình luận:', c.content)
                                    if (t && t.trim() && t.trim() !== c.content) editComment(c.id, t.trim())
                                  }}
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  className="btn btn-ghost row-action"
                                  title="Xóa bình luận"
                                  onClick={() => {
                                    if (window.confirm('Xóa bình luận này?')) deleteComment(c.id)
                                  }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            )}
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

        {canCmt ? (
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
        ) : (
          <div className="comment-input">
            <p className="muted">Bạn không tham gia công việc này nên không thể bình luận.</p>
          </div>
        )}
      </aside>
    </>
  )
}
