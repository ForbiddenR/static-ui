import { lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { ThemeProvider } from './theme';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';

// Dashboard (the landing route) stays eager; the other consoles are split so
// their code only downloads on first navigation. Layout owns the Suspense
// boundary around its Outlet.
const BotsConsole = lazy(() => import('./pages/BotsConsole'));
const BotDetail = lazy(() => import('./pages/BotDetail'));
const TasksConsole = lazy(() => import('./pages/TasksConsole'));
const TaskDetail = lazy(() => import('./pages/TaskDetail'));
const SchedulesConsole = lazy(() => import('./pages/SchedulesConsole'));
const ScheduleDetail = lazy(() => import('./pages/ScheduleDetail'));
const WorkersConsole = lazy(() => import('./pages/WorkersConsole'));
const WorkerDetail = lazy(() => import('./pages/WorkerDetail'));

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="bots" element={<BotsConsole />} />
              <Route path="bots/:botId" element={<BotDetail />} />
              <Route path="tasks" element={<TasksConsole />} />
              <Route path="tasks/:taskId" element={<TaskDetail />} />
              <Route path="schedules" element={<SchedulesConsole />} />
              <Route path="schedules/:scheduleId" element={<ScheduleDetail />} />
              <Route path="workers" element={<WorkersConsole />} />
              <Route path="workers/:workerId" element={<WorkerDetail />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </I18nProvider>
    </ThemeProvider>
  );
}
