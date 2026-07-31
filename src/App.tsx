import { lazy } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { ThemeProvider } from './theme';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';

// Dashboard (the landing route) stays eager; the other consoles are split so
// their code only downloads on first navigation. Layout owns the Suspense
// boundary around its Outlet.
const JobDefinitionsConsole = lazy(() => import('./pages/JobDefinitionsConsole'));
const JobDefinitionDetail = lazy(() => import('./pages/JobDefinitionDetail'));
const TasksConsole = lazy(() => import('./pages/TasksConsole'));
const TaskDetail = lazy(() => import('./pages/TaskDetail'));
const TaskRunsConsole = lazy(() => import('./pages/TaskRunsConsole'));
const TaskRunDetail = lazy(() => import('./pages/TaskRunDetail'));
const SchedulesConsole = lazy(() => import('./pages/SchedulesConsole'));
const ScheduleDetail = lazy(() => import('./pages/ScheduleDetail'));
const ScheduleRunDetail = lazy(() => import('./pages/ScheduleRunDetail'));
const WorkersConsole = lazy(() => import('./pages/WorkersConsole'));
const WorkerDetail = lazy(() => import('./pages/WorkerDetail'));

function LegacyJobDefinitionRedirect() {
  const { botId } = useParams();
  const location = useLocation();
  const pathname = botId
    ? `/job-definitions/${encodeURIComponent(botId)}`
    : '/job-definitions';
  return <Navigate replace to={{ pathname, search: location.search }} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="job-definitions" element={<JobDefinitionsConsole />} />
              <Route path="job-definitions/:jobDefinitionId" element={<JobDefinitionDetail />} />
              <Route path="bots" element={<LegacyJobDefinitionRedirect />} />
              <Route path="bots/:botId" element={<LegacyJobDefinitionRedirect />} />
              <Route path="tasks" element={<TasksConsole />} />
              <Route path="tasks/:taskId" element={<TaskDetail />} />
              <Route path="task-runs" element={<TaskRunsConsole />} />
              <Route path="task-runs/:taskRunId" element={<TaskRunDetail />} />
              <Route path="schedules" element={<SchedulesConsole />} />
              <Route path="schedules/:scheduleId" element={<ScheduleDetail />} />
              <Route path="schedule-runs/:runId" element={<ScheduleRunDetail />} />
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
