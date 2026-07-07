import { createContext, useContext, useMemo, useReducer } from 'react'
import { apiFetch } from '../api/client'
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
    departments: bootstrap.departments || [],
    channels: bootstrap.channels || [],
    tasks: bootstrap.tasks || [],
    subtasks: bootstrap.subtasks || [],
    comments: bootstrap.comments || [],
    activities: bootstrap.activities || [],
    notifications: bootstrap.notifications || [], // thông báo thật từ server
    selectedTaskId: null,
    createModal: null,
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

    case 'MARK_NOTIFS_READ':
      return {
        ...state,
        notifications: state.notifications.map((n) => (n.readAt ? n : { ...n, readAt: action.at })),
      }
    default:
      return state
  }
}

export function AppProvider({ children, bootstrap, currentUserId }) {
  const [state, dispatch] = useReducer(reducer, buildInitialState(currentUserId, bootstrap))

  const api = useMemo(() => {
    const usersById = Object.fromEntries(state.users.map((u) => [u.id, u]))
    const departmentsById = Object.fromEntries(state.departments.map((d) => [d.id, d]))
    const channelsById = Object.fromEntries(state.channels.map((c) => [c.id, c]))
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
        (currentUser.role === 'manager' && task.departmentId === currentUser.departmentId))

    // Gọi API; lỗi → báo + không làm vỡ optimistic (reload để đồng bộ nếu cần).
    const persist = async (promise, onOk) => {
      try {
        const r = await promise
        if (onOk) onOk(r)
      } catch (e) {
        console.error('[API]', e)
        alert('Lưu thất bại: ' + e.message)
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
        comment: (task) => canComment(currentUser, task, state.channels),
        review: (task) => canReview(task),
        createDeptTask: (departmentId) => canCreateDeptTask(currentUser, departmentId),
        createChannelTask: (channel) => canCreateChannelTask(currentUser, channel),
      },
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
      // Thông báo thật từ server (fan-out khi giao việc/comment/nghiệm thu…)
      notifications: state.notifications,
      unreadCount: state.notifications.filter((n) => !n.readAt).length,

      // UI actions
      selectTask: (id) => dispatch({ type: 'SELECT_TASK', id }),
      openCreateModal: (defaults) => dispatch({ type: 'OPEN_CREATE_MODAL', defaults }),
      closeCreateModal: () => dispatch({ type: 'CLOSE_CREATE_MODAL' }),
      setCurrentUser: (id) => dispatch({ type: 'SET_CURRENT_USER', id }),
      markInboxRead: () => {
        dispatch({ type: 'MARK_NOTIFS_READ', at: now() })
        persist(post('/notifications/mark-read', {}))
      },

      // ── Tạo công việc (map channel→project cho API) ──
      createTask: (input, subtaskTitles = []) => {
        if (!guard(canCreateTask(currentUser, input, state.channels), 'tạo công việc loại này')) return
        const scope = input.scope || 'personal'
        const dto = {
          title: input.title || '(Chưa đặt tên)',
          description: input.description || '',
          scope: scope === 'channel' ? 'project' : scope,
          section: input.section || undefined,
          assigneeId: input.assigneeId || me,
          priority: input.priority || 'normal',
          completionMode: input.completionMode || 'self',
        }
        if (scope === 'department') dto.departmentId = input.departmentId
        if (scope === 'channel') dto.projectId = input.channelId
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
        const status = decision === 'passed' ? 'done' : 'returned'
        dispatch({ type: 'SET_STATUS', id, at: now(), patch: { status, completedAt: decision === 'passed' ? now() : null }, activities: [makeActivity(id, me, 'review', { decision })] })
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
        dispatch({ type: 'UPDATE_TASK_FIELD', id, at: now(), patch: fieldPatch })
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
    }
  }, [state])

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp phải dùng bên trong AppProvider')
  return ctx
}
