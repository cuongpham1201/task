import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import { apiFetch, uploadFile } from '../api/client'
import { apiBase } from '../auth/authConfig'
import {
  canManageTask, canUpdateStatus, canWorkSubtasks, canComment, canCreateTask,
  canCreateDeptTask, canCreateChannelTask, visibleDepartmentsFor, visibleChannelsFor,
} from '../utils/permissions'

const AppContext = createContext(null)

// Sinh id/timestamp cho cập nhật LẠC QUAN (optimistic) trước khi API trả về.
// Task/comment/subtask sẽ được thay bằng bản ghi thật từ server; activity local
// chỉ để hiển thị tức thì (server cũng ghi activity riêng, sẽ đồng bộ khi reload).
let idCounter = 1000
const nextId = (prefix) => `${prefix}${idCounter++}`
const now = () => new Date().toISOString()
const makeActivity = (taskId, userId, action, metadata = {}) => ({
  id: nextId('a'), taskId, userId, action, metadata, createdAt: now(),
})

function buildInitialState(currentUserId, bootstrap) {
  return {
    currentUserId,
    users: bootstrap.users || [],
    blocks: bootstrap.blocks || [], // khối (để nhóm menu phòng ban theo cây)
    departments: bootstrap.departments || [],
    channels: bootstrap.channels || [],
    tasks: bootstrap.tasks || [],
    subtasks: bootstrap.subtasks || [],
    comments: bootstrap.comments || [],
    activities: bootstrap.activities || [],
    notifications: bootstrap.notifications || [], // thông báo thật từ server
    actions: bootstrap.actions || [], // Action Log (A3)
    counts: bootstrap.counts || { pendingReviewCount: 0, myActionCount: 0 },
    kpiDefinitions: bootstrap.kpiDefinitions || [], // trống tới A4
    selectedTaskId: null,
    createModal: null,
    createActionModal: null,
    createProjectModal: false,
    toasts: [],
  }
}

function applyTaskPatch(state, action) {
  const { id, patch, at, activities: acts = [] } = action
  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: at } : t)),
    activities: acts.length ? [...state.activities, ...acts] : state.activities,
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'SELECT_TASK':
      return { ...state, selectedTaskId: action.id }
    case 'OPEN_CREATE_MODAL':
      return { ...state, createModal: { defaults: action.defaults || {} } }
    case 'CLOSE_CREATE_MODAL':
      return { ...state, createModal: null }
    case 'SET_CURRENT_USER':
      return { ...state, currentUserId: action.id, selectedTaskId: null }

    case 'ADD_TASK':
      return {
        ...state,
        tasks: [action.task, ...state.tasks.filter((t) => t.id !== action.task.id)],
        subtasks: action.subtasks?.length
          ? [...state.subtasks, ...action.subtasks]
          : state.subtasks,
        activities: action.activity ? [...state.activities, action.activity] : state.activities,
        createModal: null,
        selectedTaskId: action.task.id,
      }
    // Thay task bằng bản ghi thật từ server (giữ nguyên activities đã thêm lạc quan)
    case 'REPLACE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.task.id ? action.task : t)),
      }
    case 'REMOVE_TASK':
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.id),
        selectedTaskId: state.selectedTaskId === action.id ? null : state.selectedTaskId,
      }

    case 'ASSIGN_TASK':
    case 'SET_DUE_DATE':
    case 'SET_PRIORITY':
    case 'SET_STATUS':
    case 'SET_PROGRESS':
    case 'UPDATE_TASK_FIELD':
      return applyTaskPatch(state, action)

    case 'ADD_COMMENT':
      return {
        ...state,
        comments: [...state.comments, action.comment],
        activities: action.activity ? [...state.activities, action.activity] : state.activities,
      }
    case 'REPLACE_COMMENT':
      return {
        ...state,
        comments: state.comments.map((c) => (c.id === action.tempId ? action.comment : c)),
      }
    case 'UPDATE_COMMENT':
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.id ? { ...c, content: action.content, updatedAt: action.at } : c
        ),
      }
    case 'REMOVE_COMMENT':
      return { ...state, comments: state.comments.filter((c) => c.id !== action.id) }

    case 'ADD_SUBTASK':
      return { ...state, subtasks: [...state.subtasks, action.subtask] }
    case 'REPLACE_SUBTASK':
      return {
        ...state,
        subtasks: state.subtasks.map((s) => (s.id === action.id ? action.subtask : s)),
      }
    case 'TOGGLE_SUBTASK':
      return {
        ...state,
        subtasks: state.subtasks.map((s) =>
          s.id === action.id ? { ...s, done: action.done } : s
        ),
      }
    case 'UPDATE_SUBTASK':
      return {
        ...state,
        subtasks: state.subtasks.map((s) =>
          s.id === action.id ? { ...s, ...action.patch } : s
        ),
      }
    case 'REMOVE_SUBTASK':
      return { ...state, subtasks: state.subtasks.filter((s) => s.id !== action.id) }

    case 'MARK_NOTIFS_READ':
      return {
        ...state,
        notifications: state.notifications.map((n) => (n.readAt ? n : { ...n, readAt: action.at })),
      }
    case 'MARK_ONE_READ':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.id && !n.readAt ? { ...n, readAt: action.at } : n
        ),
      }
    case 'SET_NOTIFS':
      return { ...state, notifications: action.list }
    case 'UPDATE_CHANNEL':
      return { ...state, channels: state.channels.map((c) => (c.id === action.channel.id ? action.channel : c)) }
    case 'ADD_CHANNEL':
      return { ...state, channels: [...state.channels.filter((c) => c.id !== action.channel.id), action.channel] }
    case 'REMOVE_CHANNEL':
      return { ...state, channels: state.channels.filter((c) => c.id !== action.id) }
    case 'OPEN_CREATE_PROJECT':
      return { ...state, createProjectModal: true }
    case 'CLOSE_CREATE_PROJECT':
      return { ...state, createProjectModal: false }
    case 'OPEN_CREATE_ACTION':
      return { ...state, createActionModal: { defaults: action.defaults || {} } }
    case 'CLOSE_CREATE_ACTION':
      return { ...state, createActionModal: null }
    case 'UPSERT_ACTION':
      return {
        ...state,
        actions: state.actions.some((a) => a.id === action.action.id)
          ? state.actions.map((a) => (a.id === action.action.id ? { ...a, ...action.action } : a))
          : [action.action, ...state.actions],
      }
    case 'REMOVE_ACTION':
      return { ...state, actions: state.actions.filter((a) => a.id !== action.id) }
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.toast] }
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) }
    default:
      return state
  }
}

export function AppProvider({ children, bootstrap, currentUserId }) {
  const [state, dispatch] = useReducer(reducer, buildInitialState(currentUserId, bootstrap))

  // Poll thông báo (đỡ phải F5): mỗi 20s + khi tab được focus lại.
  useEffect(() => {
    let stop = false
    const refresh = () =>
      apiFetch('/notifications')
        .then((list) => { if (!stop) dispatch({ type: 'SET_NOTIFS', list }) })
        .catch(() => {})
    const timer = setInterval(refresh, 20000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      stop = true
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const api = useMemo(() => {
    const usersById = Object.fromEntries(state.users.map((u) => [u.id, u]))
    const departmentsById = Object.fromEntries(state.departments.map((d) => [d.id, d]))
    const channelsById = Object.fromEntries(state.channels.map((c) => [c.id, c]))
    const orgUnitsById = Object.fromEntries([...state.departments, ...(state.blocks || [])].map((o) => [o.id, o]))
    const me = usersById[state.currentUserId] ? state.currentUserId : state.users[0]?.id
    const currentUser = usersById[me]

    const findTask = (id) => state.tasks.find((t) => t.id === id)

    const guard = (allowed, label) => {
      if (!allowed) console.warn(`[Phân quyền] không có quyền: ${label}`)
      return allowed
    }

    // Nghiệm thu: admin / người giao (creator) / trưởng phòng của phòng liên quan
    const canReview = (task) =>
      !!currentUser &&
      (currentUser.role === 'admin' ||
        task.creatorId === me ||
        (currentUser.role === 'manager' && task.departmentId === currentUser.orgUnitId))

    // Toast nhẹ thay alert
    const toast = (message, type = 'error') => {
      const id = nextId('toast')
      dispatch({ type: 'ADD_TOAST', toast: { id, message, type } })
      setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), 3600)
    }

    // Gọi API; lỗi → toast + không làm vỡ optimistic (reload để đồng bộ nếu cần).
    const persist = async (promise, onOk) => {
      try {
        const r = await promise
        if (onOk) onOk(r)
      } catch (e) {
        console.error('[API]', e)
        const msg = e.status === 403 ? 'Bạn không có quyền thực hiện thao tác này' : 'Lưu thất bại: ' + e.message
        toast(msg)
      }
    }
    const patch = (path, body) =>
      apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) })
    const post = (path, body) =>
      apiFetch(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })

    // ── Đổi trạng thái ──
    const setStatus = (id, status) => {
      const task = findTask(id)
      if (!task || task.status === status) return
      if (!guard(canUpdateStatus(currentUser, task), 'đổi trạng thái')) return
      // Đang chờ nghiệm thu → không đổi tay (phải qua Đạt/Trả lại)
      if (task.status === 'submitted' && !canReview(task)) {
        toast('Việc đang chờ nghiệm thu — chờ kết quả Đạt/Trả lại.', 'warn')
        return
      }
      const isDone = status === 'done'
      dispatch({
        type: 'SET_STATUS', id, at: now(),
        patch: { status, completedAt: isDone ? now() : null, progress: isDone ? 100 : task.progress },
        activities: [isDone ? makeActivity(id, me, 'complete') : makeActivity(id, me, 'status', { from: task.status, to: status })],
      })
      persist(patch(`/tasks/${id}/status`, { status }), (t) => dispatch({ type: 'REPLACE_TASK', task: t }))
    }

    return {
      state,
      currentUser,
      usersById,
      departmentsById,
      channelsById,

      perms: {
        manage: (task) => canManageTask(currentUser, task),
        updateStatus: (task) => canUpdateStatus(currentUser, task),
        subtasks: (task) => canWorkSubtasks(currentUser, task),
        comment: (task) => canComment(currentUser, task),
        review: (task) => canReview(task),
        createDeptTask: (departmentId) => canCreateDeptTask(currentUser, departmentId, state.departments),
        createChannelTask: (channel) => canCreateChannelTask(currentUser, channel),
      },
      blocks: state.blocks,
      visibleDepartments: visibleDepartmentsFor(currentUser, state.departments),
      visibleChannels: visibleChannelsFor(currentUser, state.channels),

      getTask: findTask,
      getSubtasks: (taskId) => state.subtasks.filter((s) => s.taskId === taskId),
      getComments: (taskId) =>
        state.comments
          .filter((c) => c.taskId === taskId)
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
      getActivities: (taskId) =>
        state.activities
          .filter((a) => a.taskId === taskId)
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
      myTasks: () =>
        state.tasks.filter((t) => t.assigneeId === me || t.collaboratorIds.includes(me)),
      departmentTasks: (departmentId) => state.tasks.filter((t) => t.departmentId === departmentId),
      channelTasks: (channelId) => state.tasks.filter((t) => t.channelId === channelId),
      taskContextLabel: (task) => {
        if (task.scope === 'department') return departmentsById[task.departmentId]?.name || '—'
        if (task.scope === 'channel') return channelsById[task.channelId]?.name || '—'
        return 'Cá nhân'
      },
      orgUnitsById,
      orgUnitName: (id) => orgUnitsById[id]?.name || null,
      // Ngữ cảnh đầy đủ 1 task (My Tasks polish) — không phải mở Detail mới hiểu
      taskContextFull: (task) => {
        const creator = usersById[task.creatorId]
        const assignee = usersById[task.assigneeId]
        return {
          creator,
          assignee,
          requestUnitName: task.orgUnitName || orgUnitsById[task.orgUnitId]?.name || null,
          doUnitName: assignee?.orgUnitId ? (orgUnitsById[assignee.orgUnitId]?.name || null) : null,
          projectName: task.projectId ? (channelsById[task.projectId]?.name || null) : null,
          actionTitle: task.actionTitle || (task.actionId ? state.actions.find((a) => a.id === task.actionId)?.title : null),
          review: task.reviewRequired ?? (task.completionMode === 'review_required'),
        }
      },
      // ── Đính kèm tệp (P0-1) ──
      fetchAttachments: (taskId) => apiFetch(`/tasks/${taskId}/attachments`),
      uploadAttachment: (taskId, file) => uploadFile(`/tasks/${taskId}/attachments`, file),
      deleteAttachment: (id) => apiFetch(`/attachments/${id}`, { method: 'DELETE' }),
      attachmentUrl: (id, dl) => `${apiBase}/attachments/${id}/file${dl ? '?dl=1' : ''}`,
      canDeleteAttachment: (att, task) =>
        !!currentUser && (currentUser.role === 'admin' || att.uploadedById === me || (task && canManageTask(currentUser, task))),

      // Tìm user cho picker (autocomplete) — KHÔNG load 706 user vào dropdown
      searchUsers: (q, { limit = 20, orgUnitId } = {}) => {
        const p = new URLSearchParams()
        if (q) p.set('q', q)
        if (limit) p.set('limit', String(limit))
        if (orgUnitId) p.set('orgUnitId', orgUnitId)
        return apiFetch(`/users/search?${p.toString()}`)
      },
      // Thông báo thật từ server (fan-out khi giao việc/comment/nghiệm thu…)
      notifications: state.notifications,
      unreadCount: state.notifications.filter((n) => !n.readAt).length,
      toasts: state.toasts,
      toast,
      dismissToast: (id) => dispatch({ type: 'REMOVE_TOAST', id }),

      // UI actions
      selectTask: (id) => dispatch({ type: 'SELECT_TASK', id }),
      openCreateModal: (defaults) => dispatch({ type: 'OPEN_CREATE_MODAL', defaults }),
      closeCreateModal: () => dispatch({ type: 'CLOSE_CREATE_MODAL' }),
      setCurrentUser: (id) => dispatch({ type: 'SET_CURRENT_USER', id }),
      markInboxRead: () => {
        dispatch({ type: 'MARK_NOTIFS_READ', at: now() })
        persist(post('/notifications/mark-read', {}))
      },
      markNotificationRead: (id) => {
        dispatch({ type: 'MARK_ONE_READ', id, at: now() })
        persist(post('/notifications/mark-read', { ids: [String(id)] }))
      },

      // ── Tạo công việc (chiều tường minh org/project/action + KPI; giữ workspaceId cho compat) ──
      createTask: (input, subtaskTitles = []) => {
        if (!guard(canCreateTask(currentUser, input, state.channels), 'tạo công việc loại này')) return
        const scope = input.scope || 'personal'
        let workspaceId = null
        if (scope === 'department') workspaceId = departmentsById[input.departmentId]?.workspaceId || null
        else if (scope === 'channel') workspaceId = input.channelId || null
        const isScorable = input.isScorable === true
        const dto = {
          title: input.title || '(Chưa đặt tên)',
          description: input.description || '',
          expectedOutput: input.expectedOutput || '',
          workspaceId,
          orgUnitId: input.orgUnitId ?? (scope === 'department' ? input.departmentId : undefined),
          projectId: input.projectId ?? (scope === 'channel' ? input.channelId : undefined),
          actionId: input.actionId || undefined,
          section: scope === 'department' ? input.section || undefined : undefined,
          assigneeId: input.assigneeId || me,
          priority: input.priority || 'normal',
          reviewRequired: isScorable ? true : (input.completionMode === 'review_required'),
          isScorable: isScorable || undefined,
          kpiDefinitionId: isScorable ? input.kpiDefinitionId : undefined,
          kpiWeight: isScorable ? input.kpiWeight : undefined,
        }
        if (input.startDate) dto.startDate = input.startDate
        if (input.dueDate) dto.dueDate = input.dueDate
        if (input.collaboratorIds?.length) dto.collaboratorIds = input.collaboratorIds
        if (subtaskTitles.length) dto.subtasks = subtaskTitles
        persist(post('/tasks', dto), (res) => {
          const { subtasks = [], ...task } = res
          dispatch({ type: 'ADD_TASK', task, subtasks, activity: makeActivity(task.id, me, 'create') })
        })
      },

      setStatus,
      toggleComplete: (task) => setStatus(task.id, task.status === 'done' ? 'todo' : 'done'),

      // ── Nghiệm thu ──
      submitTask: (id) => {
        const task = findTask(id)
        if (!task) return
        if (!guard(task.assigneeId === me || canManageTask(currentUser, task), 'nộp nghiệm thu')) return
        dispatch({ type: 'SET_STATUS', id, at: now(), patch: { status: 'submitted' }, activities: [makeActivity(id, me, 'review', { to: 'submitted' })] })
        persist(post(`/tasks/${id}/submit`), (t) => dispatch({ type: 'REPLACE_TASK', task: t }))
      },
      reviewTask: (id, decision, note = '') => {
        const task = findTask(id)
        if (!task) return
        if (!guard(canReview(task), 'nghiệm thu công việc')) return
        const passed = decision === 'passed'
        const status = passed ? 'done' : 'returned'
        dispatch({ type: 'SET_STATUS', id, at: now(), patch: { status, completedAt: passed ? now() : null, ...(passed ? { progress: 100 } : {}) }, activities: [makeActivity(id, me, 'review', { decision })] })
        persist(post(`/tasks/${id}/review`, { decision, note }), (t) => dispatch({ type: 'REPLACE_TASK', task: t }))
      },

      assignTask: (id, assigneeId) => {
        const task = findTask(id)
        if (!task || task.assigneeId === assigneeId) return
        if (!guard(canManageTask(currentUser, task), 'đổi người phụ trách')) return
        dispatch({ type: 'ASSIGN_TASK', id, at: now(), patch: { assigneeId }, activities: [makeActivity(id, me, 'assign', { from: task.assigneeId, to: assigneeId })] })
        persist(patch(`/tasks/${id}/assignee`, { assigneeId }), (t) => dispatch({ type: 'REPLACE_TASK', task: t }))
      },

      setDueDate: (id, dueDate) => {
        const task = findTask(id)
        if (!task || task.dueDate === dueDate) return
        if (!guard(canManageTask(currentUser, task), 'đổi deadline')) return
        dispatch({ type: 'SET_DUE_DATE', id, at: now(), patch: { dueDate }, activities: [makeActivity(id, me, 'due', { from: task.dueDate, to: dueDate })] })
        persist(patch(`/tasks/${id}/due-date`, { dueDate: dueDate || null }), (t) => dispatch({ type: 'REPLACE_TASK', task: t }))
      },

      setPriority: (id, priority) => {
        const task = findTask(id)
        if (!task || task.priority === priority) return
        if (!guard(canManageTask(currentUser, task), 'đổi độ ưu tiên')) return
        dispatch({ type: 'SET_PRIORITY', id, at: now(), patch: { priority }, activities: [makeActivity(id, me, 'priority', { from: task.priority, to: priority })] })
        persist(patch(`/tasks/${id}/priority`, { priority }), (t) => dispatch({ type: 'REPLACE_TASK', task: t }))
      },

      setProgress: (id, progress) => {
        const task = findTask(id)
        if (!task || task.progress === progress) return
        if (!guard(canUpdateStatus(currentUser, task), 'cập nhật tiến độ')) return
        dispatch({ type: 'SET_PROGRESS', id, at: now(), patch: { progress }, activities: [makeActivity(id, me, 'progress', { to: progress })] })
        persist(patch(`/tasks/${id}/progress`, { progress }), (t) => dispatch({ type: 'REPLACE_TASK', task: t }))
      },

      // Field phụ: description/title/section/startDate
      updateTaskField: (id, fieldPatch) => {
        const task = findTask(id)
        if (!task) return
        const needManage = Object.keys(fieldPatch).some((k) => k !== 'description')
        const allowed = needManage ? canManageTask(currentUser, task) : canUpdateStatus(currentUser, task)
        if (!guard(allowed, 'cập nhật thông tin công việc')) return
        dispatch({
          type: 'UPDATE_TASK_FIELD', id, at: now(), patch: fieldPatch,
          activities: [makeActivity(id, me, 'edit', { fields: Object.keys(fieldPatch) })],
        })
        persist(patch(`/tasks/${id}`, fieldPatch), (t) => dispatch({ type: 'REPLACE_TASK', task: t }))
      },

      addComment: (taskId, content) => {
        const task = findTask(taskId)
        if (!task) return
        if (!guard(canComment(currentUser, task, state.channels), 'bình luận')) return
        const tempId = nextId('cm')
        dispatch({ type: 'ADD_COMMENT', comment: { id: tempId, taskId, userId: me, content, createdAt: now() }, activity: makeActivity(taskId, me, 'comment') })
        persist(post(`/tasks/${taskId}/comments`, { content }), (c) => dispatch({ type: 'REPLACE_COMMENT', tempId, comment: c }))
      },

      toggleSubtask: (subtaskId) => {
        const sub = state.subtasks.find((s) => s.id === subtaskId)
        const task = sub && findTask(sub.taskId)
        if (!task) return
        if (!guard(canWorkSubtasks(currentUser, task), 'cập nhật việc con')) return
        const done = !sub.done
        dispatch({ type: 'TOGGLE_SUBTASK', id: subtaskId, done })
        persist(patch(`/subtasks/${subtaskId}`, { done }), (s) => dispatch({ type: 'REPLACE_SUBTASK', id: subtaskId, subtask: s }))
      },

      addSubtask: (taskId, title) => {
        const task = findTask(taskId)
        if (!task) return
        if (!guard(canWorkSubtasks(currentUser, task), 'thêm việc con')) return
        const tempId = nextId('s')
        dispatch({ type: 'ADD_SUBTASK', subtask: { id: tempId, taskId, title, done: false, assigneeId: null } })
        persist(post(`/tasks/${taskId}/subtasks`, { title }), (s) => dispatch({ type: 'REPLACE_SUBTASK', id: tempId, subtask: s }))
      },

      // ── Sửa/xóa (S3.5) ──
      archiveTask: (id) => {
        const task = findTask(id)
        if (!task) return
        if (!guard(canManageTask(currentUser, task), 'xóa công việc')) return
        dispatch({ type: 'REMOVE_TASK', id })
        persist(apiFetch(`/tasks/${id}`, { method: 'DELETE' }))
      },
      updateSubtask: (subtaskId, fields) => {
        const sub = state.subtasks.find((s) => s.id === subtaskId)
        const task = sub && findTask(sub.taskId)
        if (!task) return
        if (!guard(canWorkSubtasks(currentUser, task), 'sửa việc con')) return
        dispatch({ type: 'UPDATE_SUBTASK', id: subtaskId, patch: fields })
        persist(patch(`/subtasks/${subtaskId}`, fields), (s) => dispatch({ type: 'REPLACE_SUBTASK', id: subtaskId, subtask: s }))
      },
      deleteSubtask: (subtaskId) => {
        const sub = state.subtasks.find((s) => s.id === subtaskId)
        const task = sub && findTask(sub.taskId)
        if (!task) return
        if (!guard(canManageTask(currentUser, task), 'xóa việc con')) return
        dispatch({ type: 'REMOVE_SUBTASK', id: subtaskId })
        persist(apiFetch(`/subtasks/${subtaskId}`, { method: 'DELETE' }))
      },
      editComment: (commentId, content) => {
        const c = state.comments.find((x) => x.id === commentId)
        if (!c) return
        if (!guard(c.userId === me || currentUser.role === 'admin', 'sửa bình luận')) return
        dispatch({ type: 'UPDATE_COMMENT', id: commentId, content, at: now() })
        persist(patch(`/comments/${commentId}`, { content }))
      },
      deleteComment: (commentId) => {
        const c = state.comments.find((x) => x.id === commentId)
        if (!c) return
        if (!guard(c.userId === me || currentUser.role === 'admin', 'xóa bình luận')) return
        dispatch({ type: 'REMOVE_COMMENT', id: commentId })
        persist(apiFetch(`/comments/${commentId}`, { method: 'DELETE' }))
      },

      // ── Project CRUD (P0-3) ──
      createProjectModal: state.createProjectModal,
      openCreateProjectModal: () => dispatch({ type: 'OPEN_CREATE_PROJECT' }),
      closeCreateProjectModal: () => dispatch({ type: 'CLOSE_CREATE_PROJECT' }),
      createProject: (dto, onOk) =>
        persist(post('/projects', dto), (ch) => {
          dispatch({ type: 'ADD_CHANNEL', channel: ch })
          toast('Đã tạo dự án', 'success')
          onOk?.(ch)
        }),
      updateProject: (id, dto) =>
        persist(patch(`/projects/${id}`, dto), (ch) => { dispatch({ type: 'UPDATE_CHANNEL', channel: ch }); toast('Đã cập nhật dự án', 'success') }),
      archiveProject: (id, onOk) =>
        persist(post(`/projects/${id}/archive`, {}), () => { dispatch({ type: 'REMOVE_CHANNEL', id }); toast('Đã lưu trữ dự án', 'success'); onOk?.() }),

      // ── Quản lý thành viên dự án (owner) ──
      addProjectMember: (projectId, userId) => {
        persist(post(`/projects/${projectId}/members`, { userId }), (ch) => {
          dispatch({ type: 'UPDATE_CHANNEL', channel: ch })
          toast('Đã thêm thành viên', 'success')
        })
      },
      removeProjectMember: (projectId, userId) => {
        persist(apiFetch(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }), (ch) => {
          dispatch({ type: 'UPDATE_CHANNEL', channel: ch })
          toast('Đã xóa thành viên', 'success')
        })
      },

      // ── Action Log (A3) ──
      actions: state.actions,
      actionsById: Object.fromEntries(state.actions.map((a) => [a.id, a])),
      counts: state.counts,
      kpiDefinitions: state.kpiDefinitions,
      myActions: () => state.actions.filter((a) => a.ownerId === me),
      // Action cho org_unit cụ thể (để lọc trong form Task)
      actionsForOrg: (orgUnitId) => state.actions.filter((a) => a.orgUnitId === orgUnitId && !a.archived),
      // Gate UI (server vẫn enforce 403 chính xác theo org)
      canManageActions: currentUser?.role === 'admin' || currentUser?.role === 'manager',
      canManageAction: (a) =>
        !!currentUser && (currentUser.role === 'admin' || a?.ownerId === me || a?.createdById === me || currentUser.role === 'manager'),

      createActionModal: state.createActionModal,
      openCreateActionModal: (defaults) => dispatch({ type: 'OPEN_CREATE_ACTION', defaults }),
      closeCreateActionModal: () => dispatch({ type: 'CLOSE_CREATE_ACTION' }),

      createAction: (dto, onOk) =>
        persist(post('/actions', dto), (a) => {
          dispatch({ type: 'UPSERT_ACTION', action: a })
          toast('Đã tạo Action', 'success')
          onOk?.(a)
        }),
      updateAction: (id, dto, onOk) =>
        persist(patch(`/actions/${id}`, dto), (a) => {
          dispatch({ type: 'UPSERT_ACTION', action: a })
          onOk?.(a)
        }),
      archiveAction: (id) =>
        persist(post(`/actions/${id}/archive`, {}), () => {
          dispatch({ type: 'REMOVE_ACTION', id })
          toast('Đã lưu trữ Action', 'success')
        }),
      // Async fetch (page tự await; không cache trong state để tránh preload nặng)
      fetchActionDetail: (id) => apiFetch(`/actions/${id}`),
      fetchActionLog: (params = {}) => {
        const q = new URLSearchParams()
        if (params.period) q.set('period', params.period)
        if (params.orgUnitId) q.set('orgUnitId', params.orgUnitId)
        const qs = q.toString()
        return apiFetch(`/reports/action-log${qs ? `?${qs}` : ''}`)
      },
      addActionUpdate: (id, dto) =>
        post(`/actions/${id}/updates`, dto).then((u) => {
          // cập nhật latestUpdate + progress/status trong list nếu có
          apiFetch(`/actions/${id}`).then((full) => dispatch({ type: 'UPSERT_ACTION', action: full })).catch(() => {})
          return u
        }),
    }
  }, [state])

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp phải dùng bên trong AppProvider')
  return ctx
}
