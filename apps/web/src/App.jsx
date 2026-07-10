import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useSearchParams } from 'react-router-dom'
import { isInTeamsHostFast, initTeams, getTeamsSubEntityId } from './utils/teams'
import { AppProvider, useApp } from './store/AppContext'
import { AuthProvider } from './auth/AuthProvider'
import LoginGate from './auth/LoginGate'
import Sidebar from './components/layout/Sidebar'
import Topbar from './components/layout/Topbar'
import MobileDrawer from './components/layout/MobileDrawer'
import MobileNav from './components/layout/MobileNav'
import Toaster from './components/shared/Toaster'
import TaskDetailPanel from './components/task/TaskDetailPanel'
import CreateTaskModal from './components/task/CreateTaskModal'
import CreateActionModal from './components/action/CreateActionModal'
import CreateProjectModal from './components/project/CreateProjectModal'
import Dashboard from './pages/Dashboard'
import MyTasks from './pages/MyTasks'
import Inbox from './pages/Inbox'
import DepartmentPage from './pages/DepartmentPage'
import ChannelPage from './pages/ChannelPage'
import ActionLog from './pages/ActionLog'
import ActionDetail from './pages/ActionDetail'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

/** Deep link: ?task=<id> mở TaskDetailPanel (browser + Teams Activity Feed đều dùng). */
function DeepLinkHandler() {
  const { selectTask, getTask } = useApp()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const taskId = params.get('task')
    if (taskId && getTask(taskId)) {
      selectTask(taskId)
      params.delete('task')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  // Teams: init SDK + route theo subEntityId (chỉ chạy khi heuristic trong Teams — browser/PWA bỏ qua)
  useEffect(() => {
    if (!isInTeamsHostFast()) return
    initTeams().then(async (ok) => {
      if (!ok) return
      const sub = await getTeamsSubEntityId()
      if (sub && sub.startsWith('/')) navigate(sub, { replace: true })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

function AppShell() {
  const { state } = useApp()
  const [drawerOpen, setDrawerOpen] = useState(false)
  return (
    <div className="app-shell">
      <DeepLinkHandler />
      <Sidebar />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="app-main">
        <Topbar onMenu={() => setDrawerOpen(true)} />
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/my-tasks" element={<MyTasks />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/departments/:id" element={<DepartmentPage />} />
            <Route path="/channels/:id" element={<ChannelPage />} />
            <Route path="/action-log" element={<ActionLog />} />
            <Route path="/actions/:id" element={<ActionDetail />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      <TaskDetailPanel />
      {/* Mount lại mỗi lần mở để form nhận defaults mới */}
      {state.createModal && <CreateTaskModal />}
      {state.createActionModal && <CreateActionModal />}
      {state.createProjectModal && <CreateProjectModal />}
      <MobileNav />
      <Toaster />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LoginGate>
          {(me, bootstrap) => (
            <AppProvider currentUserId={me.id} bootstrap={bootstrap}>
              <AppShell />
            </AppProvider>
          )}
        </LoginGate>
      </AuthProvider>
    </BrowserRouter>
  )
}
