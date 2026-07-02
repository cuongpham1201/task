import { createContext, useContext, useMemo, useReducer } from 'react'
import {
  users, departments, channels, tasks, subtasks, comments, activities,
  CURRENT_USER_ID,
} from '../data/mock'
import { daysFromNow } from '../utils/date'
import {
  canManageTask, canUpdateStatus, canWorkSubtasks, canComment, canCreateTask,
  canCreateDeptTask, canCreateChannelTask, visibleDepartmentsFor, visibleChannelsFor,
} from '../utils/permissions'

const AppContext = createContext(null)

// ── Sinh id/timestamp: CHỈ dùng trong action creators (phía dưới),
//    tuyệt đối không gọi trong reducer để reducer thuần.
//    Phase 3: thay các creator bằng API call, id/timestamp do server sinh.
let idCounter = 1000
const nextId = (prefix) => `${prefix}${idCounter++}`
const now = () => new Date().toISOString()
const makeActivity = (taskId, userId, action, metadata = {}) => ({
  id: nextId('a'), taskId, userId, action, metadata, createdAt: now(),
})

const initialState = {
  currentUserId: CURRENT_USER_ID,
  users,
  departments,
  channels,
  tasks,
  subtasks,
  comments,
  activities,
  inboxReadAt: daysFromNow(-2, 0), // demo: có sẵn vài thông báo chưa đọc
  // UI state
  selectedTaskId: null,
  createModal: null, // null hoặc { defaults: {...} }
}

// Áp patch lên task + ghi kèm activities (đã được tạo sẵn trong payload)
function applyTaskPatch(state, action) {
  const { id, patch, at, activities: acts = [] } = action
  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: at } : t)),
    activities: acts.length ? [...state.activities, ...acts] : state.activities,
  }
}

// Reducer THUẦN: không sinh id, không đọc Date — mọi giá trị nằm sẵn trong action
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

    case 'CREATE_TASK':
      return {
        ...state,
        tasks: [action.task, ...state.tasks],
        subtasks: [...state.subtasks, ...action.subtasks],
        activities: [...state.activities, ...action.activities],
        createModal: null,
        selectedTaskId: action.task.id,
      }

    // Các thay đổi nghiệp vụ trên task — cùng cấu trúc payload {id, patch, at, activities}
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
        activities: [...state.activities, action.activity],
      }

    case 'TOGGLE_SUBTASK':
      return {
        ...state,
        subtasks: state.subtasks.map((s) =>
          s.id === action.id ? { ...s, done: !s.done } : s
        ),
      }

    case 'ADD_SUBTASK':
      return { ...state, subtasks: [...state.subtasks, action.subtask] }

    case 'MARK_INBOX_READ':
      return { ...state, inboxReadAt: action.at }

    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const api = useMemo(() => {
    const me = state.currentUserId
    const usersById = Object.fromEntries(state.users.map((u) => [u.id, u]))
    const departmentsById = Object.fromEntries(state.departments.map((d) => [d.id, d]))
    const channelsById = Object.fromEntries(state.channels.map((c) => [c.id, c]))
    const currentUser = usersById[me]

    const findTask = (id) => state.tasks.find((t) => t.id === id)

    // Guard phân quyền ở tầng action: UI có ẩn nút hay không thì action
    // vẫn bị chặn tại đây (không chỉ dựa vào việc ẩn UI)
    const guard = (allowed, label) => {
      if (!allowed) {
        console.warn(`[Phân quyền] ${currentUser.displayName} không có quyền: ${label}`)
      }
      return allowed
    }

    // ── Action creators nghiệp vụ (id/timestamp sinh ở đây, không trong reducer)

    const setStatus = (id, status) => {
      const task = findTask(id)
      if (!task || task.status === status) return
      if (!guard(canUpdateStatus(currentUser, task), 'đổi trạng thái công việc')) return
      const isDone = status === 'done'
      dispatch({
        type: 'SET_STATUS',
        id,
        at: now(),
        patch: {
          status,
          completedAt: isDone ? now() : null,
          progress: isDone ? 100 : task.progress,
        },
        activities: [
          isDone
            ? makeActivity(id, me, 'complete')
            : makeActivity(id, me, 'status', { from: task.status, to: status }),
        ],
      })
    }

    return {
      state,
      currentUser,
      usersById,
      departmentsById,
      channelsById,

      // ── Phân quyền cho UI (ẩn/disable control)
      perms: {
        manage: (task) => canManageTask(currentUser, task),
        updateStatus: (task) => canUpdateStatus(currentUser, task),
        subtasks: (task) => canWorkSubtasks(currentUser, task),
        comment: (task) => canComment(currentUser, task, state.channels),
        createDeptTask: (departmentId) => canCreateDeptTask(currentUser, departmentId),
        createChannelTask: (channel) => canCreateChannelTask(currentUser, channel),
      },
      // Phòng ban / channel hiển thị theo role (admin thấy hết)
      visibleDepartments: visibleDepartmentsFor(currentUser, state.departments),
      visibleChannels: visibleChannelsFor(currentUser, state.channels),

      // ── Selectors
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
        state.tasks.filter(
          (t) => t.assigneeId === me || t.collaboratorIds.includes(me)
        ),
      departmentTasks: (departmentId) =>
        state.tasks.filter((t) => t.departmentId === departmentId),
      channelTasks: (channelId) =>
        state.tasks.filter((t) => t.channelId === channelId),
      taskContextLabel: (task) => {
        if (task.scope === 'department') return departmentsById[task.departmentId]?.name || '—'
        if (task.scope === 'channel') return channelsById[task.channelId]?.name || '—'
        return 'Cá nhân'
      },
      // Thông báo: hoạt động trên task liên quan tới tôi, do người khác thực hiện.
      // (Đóng vai trò notification trong demo — Phase 3 tách bảng notifications riêng.)
      inboxItems: () => {
        const mine = new Set(
          state.tasks
            .filter((t) =>
              t.assigneeId === me ||
              t.creatorId === me ||
              t.collaboratorIds.includes(me)
            )
            .map((t) => t.id)
        )
        return state.activities
          .filter((a) => mine.has(a.taskId) && a.userId !== me)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      },

      // ── UI actions
      selectTask: (id) => dispatch({ type: 'SELECT_TASK', id }),
      openCreateModal: (defaults) => dispatch({ type: 'OPEN_CREATE_MODAL', defaults }),
      closeCreateModal: () => dispatch({ type: 'CLOSE_CREATE_MODAL' }),
      setCurrentUser: (id) => dispatch({ type: 'SET_CURRENT_USER', id }),
      markInboxRead: () => dispatch({ type: 'MARK_INBOX_READ', at: now() }),

      // ── Task actions (đều có guard phân quyền)
      createTask: (input, subtaskTitles = []) => {
        if (!guard(canCreateTask(currentUser, input, state.channels), 'tạo công việc loại này')) return
        const id = nextId('t')
        const at = now()
        const task = {
          id,
          title: '',
          description: '',
          scope: 'personal',
          departmentId: null,
          channelId: null,
          section: null,
          creatorId: me,
          assigneeId: me,
          collaboratorIds: [],
          status: 'todo',
          priority: 'normal',
          startDate: null,
          dueDate: null,
          progress: 0,
          createdAt: at,
          updatedAt: at,
          completedAt: null,
          ...input,
        }
        const newSubtasks = subtaskTitles.map((title) => ({
          id: nextId('s'), taskId: id, title, done: false, assigneeId: task.assigneeId,
        }))
        const acts = [makeActivity(id, me, 'create')]
        if (task.assigneeId !== me) {
          acts.push(makeActivity(id, me, 'assign', { to: task.assigneeId }))
        }
        dispatch({ type: 'CREATE_TASK', task, subtasks: newSubtasks, activities: acts })
      },

      setStatus,
      toggleComplete: (task) => setStatus(task.id, task.status === 'done' ? 'todo' : 'done'),

      assignTask: (id, assigneeId) => {
        const task = findTask(id)
        if (!task || task.assigneeId === assigneeId) return
        if (!guard(canManageTask(currentUser, task), 'đổi người phụ trách')) return
        dispatch({
          type: 'ASSIGN_TASK',
          id,
          at: now(),
          patch: { assigneeId },
          activities: [makeActivity(id, me, 'assign', { from: task.assigneeId, to: assigneeId })],
        })
      },

      setDueDate: (id, dueDate) => {
        const task = findTask(id)
        if (!task || task.dueDate === dueDate) return
        if (!guard(canManageTask(currentUser, task), 'đổi deadline')) return
        dispatch({
          type: 'SET_DUE_DATE',
          id,
          at: now(),
          patch: { dueDate },
          activities: [makeActivity(id, me, 'due', { from: task.dueDate, to: dueDate })],
        })
      },

      setPriority: (id, priority) => {
        const task = findTask(id)
        if (!task || task.priority === priority) return
        if (!guard(canManageTask(currentUser, task), 'đổi độ ưu tiên')) return
        dispatch({
          type: 'SET_PRIORITY',
          id,
          at: now(),
          patch: { priority },
          activities: [makeActivity(id, me, 'priority', { from: task.priority, to: priority })],
        })
      },

      setProgress: (id, progress) => {
        const task = findTask(id)
        if (!task || task.progress === progress) return
        if (!guard(canUpdateStatus(currentUser, task), 'cập nhật tiến độ')) return
        dispatch({
          type: 'SET_PROGRESS',
          id,
          at: now(),
          patch: { progress },
          activities: [makeActivity(id, me, 'progress', { to: progress })],
        })
      },

      // Field phụ (mô tả, ngày bắt đầu): không ghi activity.
      // Mô tả: assignee sửa được; các field khác cần quyền quản lý.
      updateTaskField: (id, patch) => {
        const task = findTask(id)
        if (!task) return
        const needManage = Object.keys(patch).some((k) => k !== 'description')
        const allowed = needManage
          ? canManageTask(currentUser, task)
          : canUpdateStatus(currentUser, task)
        if (!guard(allowed, 'cập nhật thông tin công việc')) return
        dispatch({ type: 'UPDATE_TASK_FIELD', id, at: now(), patch })
      },

      addComment: (taskId, content) => {
        const task = findTask(taskId)
        if (!task) return
        if (!guard(canComment(currentUser, task, state.channels), 'bình luận')) return
        dispatch({
          type: 'ADD_COMMENT',
          comment: { id: nextId('cm'), taskId, userId: me, content, createdAt: now() },
          activity: makeActivity(taskId, me, 'comment'),
        })
      },

      toggleSubtask: (subtaskId) => {
        const sub = state.subtasks.find((s) => s.id === subtaskId)
        const task = sub && findTask(sub.taskId)
        if (!task) return
        if (!guard(canWorkSubtasks(currentUser, task), 'cập nhật việc con')) return
        dispatch({ type: 'TOGGLE_SUBTASK', id: subtaskId })
      },

      addSubtask: (taskId, title) => {
        const task = findTask(taskId)
        if (!task) return
        if (!guard(canWorkSubtasks(currentUser, task), 'thêm việc con')) return
        dispatch({
          type: 'ADD_SUBTASK',
          subtask: { id: nextId('s'), taskId, title, done: false, assigneeId: null },
        })
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
