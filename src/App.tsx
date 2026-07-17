import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './app/AppShell'
import { PlatformProvider } from './state/PlatformContext'
import OverviewPage from './workspaces/OverviewPage'
import TasksPage from './workspaces/TasksPage'
import TaskDetailPage from './workspaces/TaskDetailPage'
import BotsPage from './workspaces/BotsPage'
import BotDetailPage from './workspaces/BotDetailPage'
import SchedulesPage from './workspaces/SchedulesPage'
import ScheduleDetailPage from './workspaces/ScheduleDetailPage'
import ResultsPage from './workspaces/ResultsPage'
import WorkersPage from './workspaces/WorkersPage'
import WorkerDetailPage from './workspaces/WorkerDetailPage'

export default function App() {
  return <PlatformProvider>
    <HashRouter>
      <Routes>
        <Route element={<AppShell/>}>
          <Route index element={<Navigate to="/overview" replace/>}/>
          <Route path="overview" element={<OverviewPage/>}/>
          <Route path="tasks" element={<TasksPage/>}/>
          <Route path="tasks/:taskId" element={<TaskDetailPage/>}/>
          <Route path="bots" element={<BotsPage/>}/>
          <Route path="bots/:botId" element={<BotDetailPage/>}/>
          <Route path="schedules" element={<SchedulesPage/>}/>
          <Route path="schedules/:scheduleId" element={<ScheduleDetailPage/>}/>
          <Route path="results" element={<ResultsPage/>}/>
          <Route path="workers" element={<WorkersPage/>}/>
          <Route path="workers/:workerId" element={<WorkerDetailPage/>}/>
          <Route path="*" element={<Navigate to="/overview" replace/>}/>
        </Route>
      </Routes>
    </HashRouter>
  </PlatformProvider>
}
