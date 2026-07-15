import { useState } from 'react'
import { CheckCircle2, Circle, MessageSquare, GitBranch, ChevronDown, ChevronRight, Trash2, X } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'
import { StatusBadge, StatusSelect, PriorityBadge } from '../shared/badges'
import ProgressBar from '../shared/ProgressBar'
import EmptyState from '../shared/EmptyState'
import TaskCardMobile from './TaskCardMobile'
import useIsMobile from '../../utils/useIsMobile'
import { dueLabel } from '../../utils/date'
import { useLocalStorage } from '../../utils/useLocalStorage'
import { SECTIONS, SECTION_ORDER, STATUS, STATUS_ORDER, PRIORITY, PRIORITY_ORDER } from '../../data/constants'

function TaskRow({ task, showContext, selectable, selected, onToggleSel, dragProps }) {
  const {
    usersById, perms, selectTask, toggleComplete, setStatus,
    getSubtasks, getComments, taskContextLabel, taskContextFull, toggleSubtask,
  } = useApp()
  // FEATURE-004: xổ cây việc con ngay trong bảng (không cần mở drawer)
  const [expanded, setExpanded] = useState(false)
  const creator = usersById[task.creatorId]
  const subs = getSubtasks(task.id)
  const commentCount = getComments(task.id).length
  const due = dueLabel(task)
  const isDone = task.status === 'done'
  const canStatus = perms.updateStatus(task)
  const canSubs = perms.subtasks(task)
  const ctx = taskContextFull(task)
  const colCount = 7 + (showContext ? 1 : 0) + (selectable ? 1 : 0)

  return (
    <>
    <tr className={`task-row ${isDone ? 'done' : ''} ${selected ? 'row-selected' : ''} ${dragProps ? 'draggable-row' : ''}`} onClick={() => selectTask(task.id)} {...(dragProps || {})}>
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
            <button
              className={`meta-icon subtask-toggle ${expanded ? 'open' : ''}`}
              title={expanded ? 'Thu gọn việc con' : 'Xổ danh sách việc con'}
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            >
              <GitBranch size={13} /> {subs.filter((s) => s.done).length}/{subs.length}
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
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
    {expanded && <SubtaskRows task={task} subs={subs} colCount={colCount} canSubs={canSubs} />}
    </>
  )
}

/** Các dòng việc con xổ dưới TaskRow — tick trực tiếp, click mở panel task cha. */
function SubtaskRows({ task, subs, colCount, canSubs }) {
  const { toggleSubtask, selectTask } = useApp()
  return subs.map((sub) => (
    <tr key={sub.id} className="subtask-row" onClick={() => selectTask(task.id)}>
      <td colSpan={colCount}>
        <span className="subtask-row-inner">
          <button
            className={`tick small ${sub.done ? 'ticked' : ''}`}
            disabled={!canSubs}
            title={!canSubs ? 'Bạn không có quyền cập nhật việc con' : sub.done ? 'Bỏ hoàn thành' : 'Hoàn thành'}
            onClick={(e) => { e.stopPropagation(); toggleSubtask(sub.id) }}
          >
            {sub.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
          </button>
          <span className={sub.done ? 'subtask-done' : ''}>{sub.title}</span>
        </span>
      </td>
    </tr>
  ))
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

// Nhóm theo section — task chưa gán mục (section null, VD tạo từ dự án/chuyển đơn vị)
// PHẢI vào nhóm "Chưa phân mục", không được biến mất khỏi danh sách.
function sectionGroups(tasks) {
  const groups = SECTION_ORDER
    .map((key) => ({ key, name: SECTIONS[key], items: tasks.filter((t) => t.section === key) }))
  const known = new Set(SECTION_ORDER)
  const other = tasks.filter((t) => !known.has(t.section))
  if (other.length) groups.push({ key: 'other', name: 'Chưa phân mục', items: other })
  return groups.filter((g) => g.items.length > 0)
}

export default function TaskTable({ tasks, showContext = true, groupBySection = false, groupByAppSection = false, emptyText = 'Không có công việc nào' }) {
  const isMobile = useIsMobile()

  // Nhóm theo "Section" (danh sách chung) — desktop có kéo-thả; mobile hiện nhóm thẻ (đổi section qua chi tiết task).
  if (groupByAppSection) {
    if (tasks.length === 0) return <EmptyState title={emptyText} hint="Nhấn “Tạo công việc” để thêm việc mới." />
    return <AppSectionGrouped tasks={tasks} showContext={showContext} />
  }

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
    const groups = sectionGroups(tasks)
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
  const groups = sectionGroups(tasks)

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

/**
 * Nhóm task theo "Section" (danh sách chung admin) + KÉO-THẢ giữa section (kiểu Asana).
 * Hiện tất cả section active (cả rỗng) để có chỗ thả + nhóm "Chưa có section".
 * Thả 1 task vào section → updateTaskField(sectionId). Chỉ ai có quyền sửa task mới thả được.
 */
function AppSectionGrouped({ tasks, showContext }) {
  const { state, updateTaskField, perms } = useApp()
  const isMobile = useIsMobile()
  const [overKey, setOverKey] = useState(null)
  const [collapsed, setCollapsed] = useLocalStorage('section.collapsed', {})
  const toggleCollapse = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }))
  const sections = state.sections || []

  const byId = new Map(sections.map((s) => [s.id, { key: s.id, id: s.id, name: s.name, items: [] }]))
  const noneGroup = { key: '__none__', id: null, name: 'Chưa có section', items: [] }
  for (const t of tasks) {
    const g = (t.sectionId && byId.get(t.sectionId)) || noneGroup
    g.items.push(t)
  }
  const groups = [noneGroup, ...byId.values()] // "Chưa có section" lên đầu, rồi tới các section

  // Mobile: hiện nhóm thẻ (thu/mở), KHÔNG kéo-thả (đổi section qua chi tiết task).
  if (isMobile) {
    return (
      <div className="task-card-list">
        {groups.filter((g) => g.items.length > 0).map((g) => {
          const isCollapsed = !!collapsed[g.key]
          return (
            <div key={g.key} className="task-card-group">
              <button className="task-card-group-head section-toggle-row" onClick={() => toggleCollapse(g.key)}>
                {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                {g.name} <span className="section-count">{g.items.length}</span>
              </button>
              {!isCollapsed && g.items.map((t) => <TaskCardMobile key={t.id} task={t} showContext={showContext} />)}
            </div>
          )
        })}
      </div>
    )
  }

  const onDrop = (group) => (e) => {
    e.preventDefault(); setOverKey(null)
    const taskId = e.dataTransfer.getData('text/task')
    if (!taskId) return
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.sectionId === group.id) return
    if (!perms.updateStatus(task)) return // cùng quyền như đổi trạng thái
    updateTaskField(taskId, { sectionId: group.id })
  }
  const dragStart = (task) => (e) => {
    e.dataTransfer.setData('text/task', task.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="table-wrap">
      <table className="task-table">
        <TableHead showContext={showContext} />
        {groups.map((g) => {
          const isCollapsed = !!collapsed[g.key]
          return (
            <tbody
              key={g.key}
              className={`section-dnd ${overKey === g.key ? 'section-dnd-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); if (overKey !== g.key) setOverKey(g.key) }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setOverKey(null) }}
              onDrop={onDrop(g)}
            >
              <tr className="section-row">
                <td colSpan={showContext ? 7 : 6}>
                  <button className="section-toggle" onClick={() => toggleCollapse(g.key)} title={isCollapsed ? 'Mở rộng' : 'Thu gọn'}>
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {g.name} <span className="section-count">{g.items.length}</span>
                  {isCollapsed && g.items.length > 0 && <span className="muted section-drop-hint"> · đã thu gọn</span>}
                  {overKey === g.key && <span className="muted section-drop-hint"> — thả vào đây</span>}
                </td>
              </tr>
              {!isCollapsed && g.items.map((t) => (
                <TaskRow key={t.id} task={t} showContext={showContext} dragProps={{ draggable: true, onDragStart: dragStart(t) }} />
              ))}
              {!isCollapsed && g.items.length === 0 && (
                <tr className="section-empty-row"><td colSpan={showContext ? 7 : 6} className="muted">Kéo task vào đây…</td></tr>
              )}
            </tbody>
          )
        })}
      </table>
    </div>
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
