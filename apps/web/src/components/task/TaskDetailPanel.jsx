import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  X, CheckCircle2, Circle, Plus, Send, CalendarDays, ThumbsUp, Undo2, Pencil, Trash2, Paperclip, Download, Eye, EyeOff, Camera,
} from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'
import SearchUser from '../shared/SearchUser'
import { orgUnitLabel } from '../../utils/org'
import MentionCommentBox from './MentionCommentBox'
import { StatusBadge, PriorityBadge, StatusSelect, PrioritySelect } from '../shared/badges'
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

// FEATURE-004: chọn người thực hiện bằng PICKER TÌM KIẾM (không dropdown 705 người)
function AssigneeSelect({ value, onChange }) {
  const { usersById } = useApp()
  const [editing, setEditing] = useState(false)
  const user = usersById[value]
  if (!editing) {
    return (
      <button className="detail-user-btn" onClick={() => setEditing(true)} title="Đổi người thực hiện">
        {user ? (
          <span className="cell-user"><Avatar user={user} size={24} /> {user.displayName}</span>
        ) : 'Chọn người thực hiện'}
      </button>
    )
  }
  return (
    <SearchUser
      value={null}
      onSelect={(id) => { if (id) onChange(id); setEditing(false) }}
      placeholder="Tìm người thực hiện…"
    />
  )
}

export default function TaskDetailPanel() {
  const {
    state, usersById, currentUser, perms, getTask, getSubtasks, getComments, getActivities,
    selectTask, updateTaskField, setStatus, toggleComplete,
    assignTask, setCollaborators, setTaskOrgUnit, setDueDate, setPriority, submitTask, reviewTask, activateTask,
    addComment, toggleSubtask, addSubtask, taskContextLabel,
    archiveTask, updateSubtask, deleteSubtask, editComment, deleteComment,
    actionsById, channelsById, actionsForOrg, orgUnitName, watchTask, unwatchTask, sectionsById,
  } = useApp()

  const task = state.selectedTaskId ? getTask(state.selectedTaskId) : null
  const [description, setDescription] = useState('')
  const [expectedLocal, setExpectedLocal] = useState('')
  const [commentText, setCommentText] = useState('')
  const [newSubtask, setNewSubtask] = useState('')
  const [tab, setTab] = useState('comments')
  const [pickingReviewer, setPickingReviewer] = useState(false)

  useEffect(() => {
    if (task) {
      setDescription(task.description || '')
      setExpectedLocal(task.expectedOutput || '')
      setCommentText('')
      setNewSubtask('')
      setTab('comments')
      setPickingReviewer(false)
    }
    // Chỉ reset khi mở task khác
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id])

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

  // Hướng 3: ứng viên @mention = người trong phạm vi xem task (luôn ⊆ người xem được →
  // không gây 400 từ backend). Gồm: người liên quan trực tiếp + thành viên dự án +
  // biên chế phòng phụ trách.
  const mentionCandidates = (() => {
    const ids = new Set([task.creatorId, task.assigneeId, task.reviewerId,
      ...(task.collaboratorIds || []), ...(task.watcherIds || [])].filter(Boolean))
    if (task.channelId) (channelsById[task.channelId]?.members || []).forEach((id) => ids.add(id))
    if (task.departmentId) state.users.forEach((u) => { if (u.orgUnitId === task.departmentId) ids.add(u.id) })
    return [...ids].map((id) => usersById[id]).filter(Boolean)
  })()

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
            {(() => {
              const watching = (task.watcherIds || []).includes(currentUser?.id)
              return (
                <button
                  className={`btn btn-ghost ${watching ? 'is-watching' : ''}`}
                  title={watching ? 'Đang theo dõi — bấm để bỏ' : 'Theo dõi để nhận thông báo'}
                  onClick={() => (watching ? unwatchTask(task.id) : watchTask(task.id))}
                >
                  {watching ? <Eye size={17} /> : <EyeOff size={17} />}
                </button>
              )
            })()}
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
          {task.isDraft && (
            <div className="draft-banner">
              <span><strong>Nháp</strong> — chỉ mình bạn thấy. Soạn xong (người thực hiện, hạn, mô tả…) rồi bấm để giao & thông báo.</span>
              {canManage && (
                <button className="btn btn-primary" onClick={() => activateTask(task.id)}>Bắt đầu giao</button>
              )}
            </div>
          )}
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
              <span className="collab-list">
                {task.collaboratorIds.length === 0 && !canManage && <span className="muted">Không có</span>}
                {task.collaboratorIds.map((id) => {
                  const u = usersById[id]
                  return u && (
                    <span key={id} className="cell-user small">
                      <Avatar user={u} size={20} /> {u.displayName}
                      {canManage && (
                        <button className="btn btn-ghost" style={{ padding: '0 2px' }} title="Bỏ khỏi phối hợp"
                          onClick={() => setCollaborators(task.id, task.collaboratorIds.filter((x) => x !== id))}>
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  )
                })}
                {canManage && (
                  <SearchUser value={null} autoFocus={false} placeholder="+ Thêm người phối hợp…"
                    onSelect={(id) => id && !task.collaboratorIds.includes(id) && id !== task.assigneeId &&
                      setCollaborators(task.id, [...task.collaboratorIds, id])} />
                )}
              </span>
            </Field>
            <Field label="Đơn vị yêu cầu">
              {canManage ? (
                <select
                  value={task.orgUnitId || '__personal__'}
                  onChange={(e) => {
                    if (e.target.value === '__personal__') {
                      if (window.confirm('Chuyển thành việc CÁ NHÂN riêng tư? Task sẽ gỡ khỏi phòng ban/dự án và chỉ bạn + người được giao (người phối hợp/theo dõi) nhìn thấy.')) {
                        updateTaskField(task.id, { personal: true })
                      }
                    } else setTaskOrgUnit(task.id, e.target.value)
                  }}
                >
                  <option value="__personal__">— Cá nhân (riêng tư) —</option>
                  {task.orgUnitId && !state.departments.some((d) => d.id === task.orgUnitId) && (
                    <option value={task.orgUnitId}>{task.orgUnitName || 'Đơn vị hiện tại'}</option>
                  )}
                  {state.departments.map((d) => (
                    <option key={d.id} value={d.id}>{orgUnitLabel(d)}</option>
                  ))}
                </select>
              ) : (
                task.orgUnitName || taskContextLabel(task)
              )}
            </Field>
            <Field label="Đơn vị thực hiện">
              {assignee?.orgUnitId ? (orgUnitName(assignee.orgUnitId) || '—') : '—'}
              <span className="muted" style={{ fontSize: 11, display: 'block' }}>tự động theo đơn vị biên chế của người thực hiện</span>
            </Field>
            <Field label="Dự án">
              {canManage ? (
                <select value={task.projectId || ''} onChange={(e) => updateTaskField(task.id, { projectId: e.target.value || null })}>
                  <option value="">— Không thuộc dự án —</option>
                  {task.projectId && !state.channels.some((c) => c.id === task.projectId) && (
                    <option value={task.projectId}>{channelsById[task.projectId]?.name || task.projectName || 'Dự án hiện tại'}</option>
                  )}
                  {state.channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                task.projectId ? (channelsById[task.projectId]?.name || task.projectName || '—') : <span className="muted">Không</span>
              )}
            </Field>
            <Field label="Action">
              {canManage ? (
                <select value={task.actionId || ''} onChange={(e) => updateTaskField(task.id, { actionId: e.target.value || null })}>
                  <option value="">— Không thuộc Action —</option>
                  {task.actionId && !actionsForOrg(task.departmentId).some((a) => a.id === task.actionId) && (
                    <option value={task.actionId}>{task.actionTitle || 'Action hiện tại'}</option>
                  )}
                  {actionsForOrg(task.departmentId).map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              ) : task.actionId ? (
                <Link className="link" to={`/actions/${task.actionId}`} onClick={() => selectTask(null)}>
                  {task.actionTitle || actionsById[task.actionId]?.title || 'Xem Action'}
                </Link>
              ) : (
                <span className="muted">Không</span>
              )}
            </Field>
            {(state.sections.length > 0 || task.sectionId) && (
              <Field label="Section">
                {canManage ? (
                  <select value={task.sectionId || ''} onChange={(e) => updateTaskField(task.id, { sectionId: e.target.value || null })}>
                    <option value="">— Không —</option>
                    {task.sectionId && !state.sections.some((s) => s.id === task.sectionId) && (
                      <option value={task.sectionId}>{sectionsById[task.sectionId]?.name || 'Section hiện tại'}</option>
                    )}
                    {state.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : task.sectionId ? (sectionsById[task.sectionId]?.name || '—') : <span className="muted">Không</span>}
              </Field>
            )}
          </div>

          <h3 className="detail-group-title">Chi tiết công việc</h3>
          <div className="detail-fields">
            <Field label="Nghiệm thu">
              {canManage && !task.isScorable ? (
                <select
                  value={reviewRequired ? 'yes' : 'no'}
                  onChange={(e) => {
                    if (e.target.value === 'no') updateTaskField(task.id, { reviewRequired: false })
                    else if (task.reviewerId) updateTaskField(task.id, { reviewRequired: true })
                    else setPickingReviewer(true) // bật nghiệm thu phải chọn reviewer trước
                  }}
                >
                  <option value="no">Tự hoàn thành</option>
                  <option value="yes">Cần nghiệm thu</option>
                </select>
              ) : (
                reviewRequired ? 'Cần nghiệm thu' : 'Tự hoàn thành'
              )}
            </Field>
            {(reviewRequired || pickingReviewer) && (
              <Field label="Người nghiệm thu">
                {canManage ? (
                  pickingReviewer || !task.reviewerId ? (
                    <SearchUser
                      value={null}
                      autoFocus={false}
                      placeholder="Chọn người nghiệm thu…"
                      onSelect={(id) => {
                        if (!id) return
                        updateTaskField(task.id, { reviewRequired: true, reviewerId: id })
                        setPickingReviewer(false)
                      }}
                    />
                  ) : (
                    <span className="cell-user">
                      <Avatar user={usersById[task.reviewerId]} size={22} /> {usersById[task.reviewerId]?.displayName || '—'}
                      <button className="btn btn-ghost" style={{ padding: '0 4px' }} title="Đổi người nghiệm thu" onClick={() => setPickingReviewer(true)}>
                        <Pencil size={12} />
                      </button>
                    </span>
                  )
                ) : (
                  task.reviewerId ? (
                    <span className="cell-user"><Avatar user={usersById[task.reviewerId]} size={22} /> {usersById[task.reviewerId]?.displayName || '—'}</span>
                  ) : <span className="muted">Chưa chỉ định (người giao/quản lý duyệt)</span>
                )}
              </Field>
            )}
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
              {/* FEATURE-004: tiến độ KHÔNG kéo tay — chỉ cập nhật qua Nhật ký thực hiện
                  (có nội dung + % đi kèm → truy vết được ai báo, báo lúc nào) */}
              <span className="progress-edit">
                <span className="progress-track" style={{ flex: 1 }}>
                  <span className="progress-fill" style={{ width: `${task.progress || 0}%` }} />
                </span>
                <span className="progress-label">{task.progress || 0}%</span>
              </span>
              <span className="muted" style={{ fontSize: 11, display: 'block' }}>
                cập nhật % trong "Nhật ký thực hiện" bên dưới
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
            <h3>Kết quả cần đạt {reviewRequired && <span className="chip chip-review">đối chiếu khi nghiệm thu</span>}</h3>
            <textarea
              className="detail-desc"
              placeholder={canManage ? 'Nhập kết quả cần đạt để nghiệm thu đối chiếu…' : 'Chưa đặt kết quả cần đạt'}
              readOnly={!canManage}
              value={expectedLocal}
              onChange={(e) => setExpectedLocal(e.target.value)}
              onBlur={() => { if (canManage && expectedLocal !== (task.expectedOutput || '')) updateTaskField(task.id, { expectedOutput: expectedLocal }) }}
              rows={2}
            />
          </div>

          <WorkLogSection task={task} />

          <AttachmentsSection task={task} />

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
          <MentionCommentBox disabled={!canCmt} candidates={mentionCandidates} onSubmit={(t, ids) => addComment(task.id, t, ids)} />
        ) : (
          <div className="comment-input">
            <p className="muted">Bạn không tham gia công việc này nên không thể bình luận.</p>
          </div>
        )}
      </aside>
    </>
  )
}

function AttachmentsSection({ task }) {
  const {
    fetchAttachments, uploadAttachment, deleteAttachment, attachmentUrl, canDeleteAttachment, perms, toast,
  } = useApp()
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef()
  const camRef = useRef()
  const canAttach = perms.attach(task)

  const load = () => fetchAttachments(task.id).then(setItems).catch(() => {})
  useEffect(() => { load() /* eslint-disable-next-line */ }, [task.id])

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true)
    try { await uploadAttachment(task.id, f); await load() }
    catch (err) { toast('Tải tệp thất bại: ' + err.message) }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }
  const del = async (a) => {
    if (!window.confirm(`Xóa tệp "${a.fileName}"?`)) return
    try { await deleteAttachment(a.id); setItems((x) => x.filter((y) => y.id !== a.id)) }
    catch { toast('Xóa tệp thất bại') }
  }

  return (
    <div className="detail-section">
      <h3>Đính kèm ({items.length})</h3>
      <div className="attach-list">
        {items.length === 0 && <p className="muted">Chưa có tệp đính kèm.</p>}
        {items.map((a) => (
          <div key={a.id} className="attach-item">
            {a.isImage ? (
              <a href={attachmentUrl(a.id)} target="_blank" rel="noreferrer">
                <img className="attach-thumb" src={attachmentUrl(a.id)} alt={a.fileName} />
              </a>
            ) : (
              <span className="attach-icon"><Paperclip size={16} /></span>
            )}
            <a className="attach-name" href={attachmentUrl(a.id)} target="_blank" rel="noreferrer">{a.fileName}</a>
            <span className="muted attach-size">{Math.max(1, Math.round(a.sizeBytes / 1024))} KB</span>
            <a className="btn btn-ghost" href={attachmentUrl(a.id, true)} title="Tải xuống"><Download size={14} /></a>
            {canDeleteAttachment(a, task) && (
              <button className="btn btn-ghost" onClick={() => del(a)} title="Xóa"><Trash2 size={14} /></button>
            )}
          </div>
        ))}
      </div>
      {canAttach && (
        <div className="attach-add">
          <input ref={fileRef} type="file" hidden onChange={onFile} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
          <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Paperclip size={15} /> {busy ? 'Đang tải…' : 'Thêm tệp'}
          </button>
          <button className="btn mobile-only" disabled={busy} onClick={() => camRef.current?.click()}>
            <Camera size={15} /> Chụp ảnh
          </button>
        </div>
      )}
    </div>
  )
}

function WorkLogSection({ task }) {
  const { fetchWorkLogs, addWorkLog, usersById, perms, toast } = useApp()
  const [items, setItems] = useState([])
  const [content, setContent] = useState('')
  const [progress, setProgressV] = useState('')
  const [busy, setBusy] = useState(false)
  const canWork = perms.updateStatus(task)

  const load = () => fetchWorkLogs(task.id).then(setItems).catch(() => {})
  useEffect(() => { load() /* eslint-disable-next-line */ }, [task.id])

  // FEATURE-004: % mỗi nhật ký CỘNG DỒN vào tiến độ — tổng tối đa 100%
  const usedProgress = items.reduce((sum, w) => sum + (w.progressValue || 0), 0)
  const remaining = Math.max(0, 100 - usedProgress)

  const submit = async () => {
    const c = content.trim()
    if (!c || busy) return
    if (progress !== '' && Number(progress) > remaining) {
      toast(`Tổng tiến độ vượt 100% — chỉ còn nhập tối đa ${remaining}%`, 'warn')
      return
    }
    setBusy(true)
    const dto = { content: c }
    if (progress !== '') dto.progressValue = Number(progress)
    try { await addWorkLog(task.id, dto); setContent(''); setProgressV(''); await load() }
    catch (e) { toast('Ghi nhật ký thất bại: ' + e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="detail-section">
      <h3>Nhật ký thực hiện ({items.length})</h3>
      {canWork && (
        <div className="worklog-add">
          <input placeholder="VD: Đã khảo sát hiện trường / Đang thi công…" value={content}
            onChange={(e) => setContent(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
          <input type="number" min="0" max={remaining} placeholder={remaining > 0 ? `+% (còn ${remaining})` : '100%'}
            disabled={remaining <= 0} title={remaining <= 0 ? 'Tiến độ đã đạt 100% — chỉ ghi được nhật ký không kèm %' : `Còn lại ${remaining}%`}
            value={progress} onChange={(e) => setProgressV(e.target.value)} style={{ width: 96 }} />
          <button className="btn btn-primary" disabled={busy || !content.trim()} onClick={submit}><Plus size={15} /></button>
        </div>
      )}
      {canWork && remaining <= 0 && (
        <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>Tiến độ đã đạt 100% — nhật ký mới không được cộng thêm %.</p>
      )}
      {items.length === 0 && <p className="muted">Chưa có nhật ký thực hiện.</p>}
      <div className="worklog-list">
        {items.map((w) => (
          <div key={w.id} className="worklog-item">
            <span className="worklog-content">{w.content}</span>
            <span className="muted worklog-meta">
              {usersById[w.authorId]?.displayName || 'NV'} · {timeAgo(w.createdAt)}
              {w.progressValue != null && <> · {w.progressValue}%</>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
