import { createContext, useContext, useMemo, useReducer } from 'react'
import {
  users, departments, channels, tasks, subtasks, comments, activities,
  CURRENT_USER_ID,
} from '../data/mock'
import { daysFromNow } from '../utils/date'

const AppContext = createContext(null)

let idCounter = 1000
const nextId = (prefix) => `${prefix}${idCounter++}`
const now = () => new Date().toISOString()

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

function makeActivity(taskId, userId, action, metadata = {}) {
  return { id: nextId('a'), taskId, userId, action, metadata, createdAt: now() }
}

function patchTask(state, id, patch) {
  return {
    ...state,
    tasks: state.tasks.map((t) =>
      t.id === id ? { ...t, ...patch, updatedAt: now() } : t
    ),
  }
}

function reducer(state, action) {
  const me = state.currentUserId
  switch (action.type) {
    case 'SELECT_TASK':
      return { ...state, selectedTaskId: action.id }

    case 'OPEN_CREATE_MODAL':
      return { ...state, createModal: { defaults: action.defaults || {} } }

    case 'CLOSE_CREATE_MODAL':
      return { ...state, createModal: null }

    case 'SET_CURRENT_USER':
      return { ...state, currentUserId: action.id, selectedTaskId: null }

    case 'CREATE_TASK': {
      const id = nextId('t')
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
        createdAt: now(),
        updatedAt: now(),
        completedAt: null,
        ...action.task,
      }
      const newSubtasks = (action.subtasks || []).map((title) => ({
        id: nextId('s'), taskId: id, title, done: false, assigneeId: task.assigneeId,
      }))
      const acts = [makeActivity(id, me, 'create')]
      if (task.assigneeId && task.assigneeId !== me) {
        acts.push(makeActivity(id, me, 'assign', { to: task.assigneeId }))
      }
      return {
        ...state,
        tasks: [task, ...state.tasks],
        subtasks: [...state.subtasks, ...newSubtasks],
        activities: [...state.activities, ...acts],
        createModal: null,
        selectedTaskId: id,
      }
    }

    case 'UPDATE_TASK':
      return patchTask(state, action.id, action.patch)

    case 'SET_STATUS': {
      const task = state.tasks.find((t) => t.id === action.id)
      if (!task || task.status === action.status) return state
      const isDone = action.status === 'done'
      const next = patchTask(state, action.id, {
        status: action.status,
        completedAt: isDone ? now() : null,
        progress: isDone ? 100 : task.progress,
      })
      const act = isDone
        ? makeActivity(action.id, me, 'complete')
        : makeActivity(action.id, me, 'status', { from: task.status, to: action.status })
      return { ...next, activities: [...next.activities, act] }
    }

    case 'SET_PROGRESS': {
      const next = patchTask(state, action.id, { progress: action.progress })
      return {
        ...next,
        activities: [...next.activities, makeActivity(action.id, me, 'progress', { to: action.progress })],
      }
    }

    case 'ADD_COMMENT': {
      const comment = {
        id: nextId('cm'), taskId: action.taskId, userId: me,
        content: action.content, createdAt: now(),
      }
      return {
        ...state,
        comments: [...state.comments, comment],
        activities: [...state.activities, makeActivity(action.taskId, me, 'comment')],
      }
    }

    case 'TOGGLE_SUBTASK':
      return {
        ...state,
        subtasks: state.subtasks.map((s) =>
          s.id === action.id ? { ...s, done: !s.done } : s
        ),
      }

    case 'ADD_SUBTASK':
      return {
        ...state,
        subtasks: [
          ...state.subtasks,
          { id: nextId('s'), taskId: action.taskId, title: action.title, done: false, assigneeId: null },
        ],
      }

    case 'MARK_INBOX_READ':
      return { ...state, inboxReadAt: now() }

    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const api = useMemo(() => {
    const usersById = Object.fromEntries(state.users.map((u) => [u.id, u]))
    const departmentsById = Object.fromEntries(state.departments.map((d) => [d.id, d]))
    const channelsById = Object.fromEntries(state.channels.map((c) => [c.id, c]))
    const currentUser = usersById[state.currentUserId]

    return {
      state,
      currentUser,
      usersById,
      departmentsById,
      channelsById,

      // Selectors
      getTask: (id) => state.tasks.find((t) => t.id === id),
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
          (t) => t.assigneeId === state.currentUserId ||
            t.collaboratorIds.includes(state.currentUserId)
        ),
      departmentTasks: (departmentId) =>
        state.tasks.filter((t) => t.departmentId === departmentId),
      channelTasks: (channelId) =>
        state.tasks.filter((t) => t.channelId === channelId),
      // Ngữ cảnh của task: tên phòng ban / channel / cá nhân
      taskContextLabel: (task) => {
        if (task.scope === 'department') return departmentsById[task.departmentId]?.name || '—'
        if (task.scope === 'channel') return channelsById[task.channelId]?.name || '—'
        return 'Cá nhân'
      },
      // Thông báo: hoạt động trên task liên quan tới tôi, do người khác thực hiện
      inboxItems: () => {
        const mine = new Set(
          state.tasks
            .filter((t) =>
              t.assigneeId === state.currentUserId ||
              t.creatorId === state.currentUserId ||
              t.collaboratorIds.includes(state.currentUserId)
            )
            .map((t) => t.id)
        )
        return state.activities
          .filter((a) => mine.has(a.taskId) && a.userId !== state.currentUserId)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      },

      // Actions
      selectTask: (id) => dispatch({ type: 'SELECT_TASK', id }),
      openCreateModal: (defaults) => dispatch({ type: 'OPEN_CREATE_MODAL', defaults }),
      closeCreateModal: () => dispatch({ type: 'CLOSE_CREATE_MODAL' }),
      setCurrentUser: (id) => dispatch({ type: 'SET_CURRENT_USER', id }),
      createTask: (task, subtaskTitles) =>
        dispatch({ type: 'CREATE_TASK', task, subtasks: subtaskTitles }),
      updateTask: (id, patch) => dispatch({ type: 'UPDATE_TASK', id, patch }),
      setStatus: (id, status) => dispatch({ type: 'SET_STATUS', id, status }),
      toggleComplete: (task) =>
        dispatch({ type: 'SET_STATUS', id: task.id, status: task.status === 'done' ? 'todo' : 'done' }),
      setProgress: (id, progress) => dispatch({ type: 'SET_PROGRESS', id, progress }),
      addComment: (taskId, content) => dispatch({ type: 'ADD_COMMENT', taskId, content }),
      toggleSubtask: (id) => dispatch({ type: 'TOGGLE_SUBTASK', id }),
      addSubtask: (taskId, title) => dispatch({ type: 'ADD_SUBTASK', taskId, title }),
      markInboxRead: () => dispatch({ type: 'MARK_INBOX_READ' }),
    }
  }, [state])

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp phải dùng bên trong AppProvider')
  return ctx
}
