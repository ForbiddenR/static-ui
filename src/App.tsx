import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { ThemeProvider } from './theme';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import BotsConsole from './pages/BotsConsole';
import TasksConsole from './pages/TasksConsole';
import SchedulesConsole from './pages/SchedulesConsole';
import WorkersConsole from './pages/WorkersConsole';

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="bots" element={<BotsConsole />} />
              <Route path="bots/:botId" element={<BotsConsole />} />
              <Route path="tasks" element={<TasksConsole />} />
              <Route path="tasks/:taskId" element={<TasksConsole />} />
              <Route path="schedules" element={<SchedulesConsole />} />
              <Route path="schedules/:scheduleId" element={<SchedulesConsole />} />
              <Route path="workers" element={<WorkersConsole />} />
              <Route path="workers/:workerId" element={<WorkersConsole />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </I18nProvider>
    </ThemeProvider>
  );
}
