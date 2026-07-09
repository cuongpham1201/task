import { useState } from 'react'
import { CheckCircle2, Circle, MessageSquare, GitBranch, Trash2, X } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'
import { StatusBadge, StatusSelect, PriorityBadge } from '../shared/badges'
import ProgressBar from '../shared/ProgressBar'
import EmptyState from '../shared/EmptyState'
import TaskCardMobile from './TaskCardMobile'
import useIsMobile from '../../utils/useIsMobile'
import { dueLabel } from '../../utils/date'
import { SECTIONS, SECTION_ORDER, STATUS, STATUS_ORDER, PRIORITY, PRIORITY_ORDER } from '../../data/constants'

function TaskRow({ task, showContext, selectable, selected, onToggleSel }) {
  const {
    usersById, perms, selectTask, toggleComplete, setStatus,
    getSubtasks, getComments, taskContextLabel, taskContextFull,
  } = useApp()
  const creator = usersById[task.creatorId]
  const subs = getSubtasks(task.id)
  const commentCount = getComments(task.id).length
  const due = dueLabel(task)
  const isDone = task.status === 'done'
  const canStatus = perms.updateStatus(task)
  const ctx = taskContextFull(task)

  return (
    <tr className={`task-row ${isDone ? 'done' : ''} ${selected ? 'row-selected' : ''}`} onClick={() => selectTask(task.id)}>
      {selectable && (
        <td className="col-check" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={!!selected} onChange={() => onToggleSel(task.id)} />
        </td>
      )}
      <td className="col-title">
        <button
          className={`tick ${isDone ? 'ticked' : ''}`}
          disabled={!canStatus}
          title={
            !canStatus ? 'Bạn không có quyền cập nhật task này'
              : isDone ? 'Đánh dấu chưa hoàn thành' : 'Đánh dấu hoàn thành'
          }
          onClick={(e) => { e.stopPropagation(); toggleComplete(task) }}
        >
          {isDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </button>
        <span className="task-title">{task.title}</span>
        <span className="task-subline">
          {ctx.requestUnitName && <span className="chip chip-unit" title="Đơn vị yêu cầu">{ctx.requestUnitName}</span>}
          {ctx.doUnitName && ctx.doUnitName !== ctx.requestUnitName && <span className="chip chip-do" title="Đơn vị thực hiện">→ {ctx.doUnitName}</span>}
          {ctx.actionTitle && <span className="chip chip-action" title="Action">🎯 {ctx.actionTitle}</span>}
          {ctx.projectName && <span className="chip chip-project" title="Dự án"># {ctx.projectName}</span>}
          {ctx.review && <span className="chip chip-review" title="Cần nghiệm thu">Nghiệm thu</span>}
        </span>
        <span className="task-meta-icons">
          {subs.length > 0 && (
            <span className="meta-icon" title="Việc con">
              <GitBranch size={13} /> {subs.filter((s) => s.done).length}/{subs.length}
            </span>
          )}
          {commentCount > 0 && (
            <span className="meta-icon" title="Bình luận">
              <MessageSquare size={13} /> {commentCount}
            </span>
          )}
        </span>
      </td>
      <td className="col-creator">
        {creator && (
          <span className="cell-user">
            <Avatar user={creator} size={22} />
            <span>{creator.displayName}</span>
          </span>
        )}
      </td>
      {showContext && <td className="col-context">{taskContextLabel(task)}</td>}
      <td className="col-status" onClick={(e) => e.stopPropagation()}>
        {canStatus ? (
          <StatusSelect value={task.status} onChange={(s) => setStatus(task.id, s)} />
        ) : (
          <StatusBadge status={task.status} />
        )}
      </td>
      <td className="col-priority"><PriorityBadge priority={task.priority} /></td>
      <td className={`col-due due-${due.tone}`}>{due.text}</td>
      <td className="col-progress"><ProgressBar value={task.progress} /></td>
    </tr>
  )
}

function TableHead({ showContext, selectable, allChecked, onToggleAll }) {
  return (
    <thead>
      <tr>
        {selectable && <th className="col-check"><input type="checkbox" checked={allChecked} onChange={onToggleAll} /></th>}
        <th className="col-title">Tên công việc</th>
        <th>Người giao</th>
        {showContext && <th>Phòng ban / Dự án</th>}
        <th>Trạng thái</th>
        <th>Ưu tiên</th>
        <th>Hạn hoàn thành</th>
        <th>Tiến độ</th>
      </tr>
    </thead>
  )
}

export default function TaskTable({ tasks, showContext = true, groupBySection = false, emptyText = 'Không có công việc nào' }) {
  const isMobile = useIsMobile()

  if (tasks.length === 0) {
    return <EmptyState title={emptyText} hint="Nhấn “Tạo công việc” để thêm việc mới." />
  }

  // Mobile: card list thay bảng nhiều cột (desktop giữ nguyên table)
  if (isMobile) {
    if (!groupBySection) {
      return (
        <div className="task-card-list">
          {tasks.map((t) => <TaskCardMobile key={t.id} task={t} showContext={showContext} />)}
        </div>
      )
    }
    const groups = SECTION_ORDER
      .map((key) => ({ key, name: SECTIONS[key], items: tasks.filter((t) => t.section === key) }))
      .filter((g) => g.items.length > 0)
    return (
      <div className="task-card-list">
        {groups.map((g) => (
          <div key={g.key} className="task-card-group">
            <div className="task-card-group-head">
              {g.name} <span className="section-count">{g.items.length}</span>
            </div>
            {g.items.map((t) => <TaskCardMobile key={t.id} task={t} showContext={showContext} />)}
          </div>
        ))}
      </div>
    )
  }

  if (!groupBySection) {
    return <FlatSelectableTable tasks={tasks} showContext={showContext} />
  }

  // Nhóm theo section kiểu Asana (dùng cho trang Phòng ban)
  const groups = SECTION_ORDER
    .map((key) => ({ key, name: SECTIONS[key], items: tasks.filter((t) => t.section === key) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="table-wrap">
      <table className="task-table">
        <TableHead showContext={showContext} />
        <tbody>
          {groups.map((g) => (
            <SectionGroup key={g.key} group={g} showContext={showContext} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FlatSelectableTable({ tasks, showContext }) {
  const { setStatus, setPriority, archiveTask } = useApp()
  const [sel, setSel] = useState(() => new Set())
  const visibleIds = tasks.map((t) => t.id)
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => sel.has(id))
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(visibleIds))
  const clear = () => setSel(new Set())
  const ids = [...sel].filter((id) => visibleIds.includes(id))
  const bulkStatus = (s) => { ids.forEach((id) => setStatus(id, s)); clear() }
  const bulkPriority = (p) => { ids.forEach((id) => setPriority(id, p)); clear() }
  const bulkDelete = () => { if (window.confirm(`Xóa ${ids.length} công việc đã chọn?`)) { ids.forEach((id) => archiveTask(id)); clear() } }

  return (
    <>
      {ids.length > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{ids.length} đã chọn</span>
          <select defaultValue="" onChange={(e) => { if (e.target.value) { bulkStatus(e.target.value); e.target.value = '' } }}>
            <option value="">Đổi trạng thái…</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
          </select>
          <select defaultValue="" onChange={(e) => { if (e.target.value) { bulkPriority(e.target.value); e.target.value = '' } }}>
            <option value="">Đổi ưu tiên…</option>
            {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={bulkDelete}><Trash2 size={14} /> Xóa</button>
          <button className="btn btn-ghost" onClick={clear}><X size={14} /> Bỏ chọn</button>
        </div>
      )}
      <div className="table-wrap">
        <table className="task-table">
          <TableHead showContext={showContext} selectable allChecked={allChecked} onToggleAll={toggleAll} />
          <tbody>
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} showContext={showContext} selectable selected={sel.has(t.id)} onToggleSel={toggle} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function SectionGroup({ group, showContext }) {
  return (
    <>
      <tr className="section-row">
        <td colSpan={showContext ? 7 : 6}>
          {group.name} <span className="section-count">{group.items.length}</span>
        </td>
      </tr>
      {group.items.map((t) => <TaskRow key={t.id} task={t} showContext={showContext} />)}
    </>
  )
}
