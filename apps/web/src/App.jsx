import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider, useApp } from './store/AppContext'
import Sidebar from './components/layout/Sidebar'
import Topbar from './components/layout/Topbar'
import TaskDetailPanel from './components/task/TaskDetailPanel'
import CreateTaskModal from './components/task/CreateTaskModal'
import Dashboard from './pages/Dashboard'
import MyTasks from './pages/MyTasks'
import Inbox from './pages/Inbox'
import DepartmentPage from './pages/DepartmentPage'
import ChannelPage from './pages/ChannelPage'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

function AppShell() {
  const { state } = useApp()
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <Topbar />
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/my-tasks" element={<MyTasks />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/departments/:id" element={<DepartmentPage />} />
            <Route path="/channels/:id" element={<ChannelPage />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      <TaskDetailPanel />
      {/* Mount lại mỗi lần mở để form nhận defaults mới */}
      {state.createModal && <CreateTaskModal />}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </BrowserRouter>
  )
}
