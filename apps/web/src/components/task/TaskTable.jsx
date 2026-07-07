import { CheckCircle2, Circle, MessageSquare, GitBranch } from 'lucide-react'
import { useApp } from '../../store/AppContext'
import Avatar from '../shared/Avatar'
import { StatusBadge, StatusSelect, PriorityBadge } from '../shared/badges'
import ProgressBar from '../shared/ProgressBar'
import EmptyState from '../shared/EmptyState'
import TaskCardMobile from './TaskCardMobile'
import useIsMobile from '../../utils/useIsMobile'
import { dueLabel } from '../../utils/date'
import { SECTIONS, SECTION_ORDER } from '../../data/constants'

function TaskRow({ task, showContext }) {
  const {
    usersById, perms, selectTask, toggleComplete, setStatus,
    getSubtasks, getComments, taskContextLabel,
  } = useApp()
  const creator = usersById[task.creatorId]
  const subs = getSubtasks(task.id)
  const commentCount = getComments(task.id).length
  const due = dueLabel(task)
  const isDone = task.status === 'done'
  const canStatus = perms.updateStatus(task)

  return (
    <tr className={`task-row ${isDone ? 'done' : ''}`} onClick={() => selectTask(task.id)}>
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

function TableHead({ showContext }) {
  return (
    <thead>
      <tr>
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
    return (
      <div className="table-wrap">
        <table className="task-table">
          <TableHead showContext={showContext} />
          <tbody>
            {tasks.map((t) => <TaskRow key={t.id} task={t} showContext={showContext} />)}
          </tbody>
        </table>
      </div>
    )
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
