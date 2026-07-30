import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useI18n, type Lang } from '../i18n';
import { useTheme } from '../theme';
import { useDB } from '../hooks';
import { tickSchedules, tickTask, tickWorkers, resetMockData } from '../store/api';

interface NavItem {
  to: string;
  key: string;
  idx: string;
  section?: string;
}

const NAV: NavItem[] = [
  { to: '/', key: 'nav.dashboard', idx: '00' },
  { to: '/job-definitions', key: 'nav.jobDefinitions', idx: '01', section: 'nav.section.ops' },
  { to: '/tasks', key: 'nav.tasks', idx: '02' },
  { to: '/schedules', key: 'nav.schedules', idx: '03' },
  { to: '/workers', key: 'nav.workers', idx: '04', section: 'nav.section.observe' },
];

export default function Layout() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const db = useDB();

  // Mock execution engine: advance active tasks and worker telemetry on a heartbeat.
  useEffect(() => {
    void tickSchedules();
    const timer = window.setInterval(() => {
      void tickSchedules();
      db.tasks
        .filter((x) => x.status === 'pending' || x.status === 'dispatching' || x.status === 'running')
        .forEach((x) => tickTask(x.id));
      tickWorkers();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [db]);

  const activeCount = db.tasks.filter((x) => ['pending', 'dispatching', 'running'].includes(x.status)).length;

  return (
    <>
      <div className="cyber-grid" />
      <div className="scanlines" />
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-name">JOBOPS_</div>
            <div className="brand-sub">{t('brand.sub')}</div>
          </div>
          <nav>
            {NAV.map((item) => (
              <div key={item.to}>
                {item.section && <div className="nav-section">{t(item.section)}</div>}
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  <span className="idx">{item.idx}</span>
                  {t(item.key)}
                  {item.to === '/tasks' && activeCount > 0 && (
                    <span className="chip neon" style={{ marginLeft: 'auto' }}>{activeCount}</span>
                  )}
                </NavLink>
              </div>
            ))}
          </nav>
        </aside>

        <div className="main">
          <div className="topbar">
            <div className="topbar-path">
              ~/jobops<b>{location.pathname}</b>
            </div>
            <div className="topbar-controls">
              <span className="chip green" style={{ cursor: 'default' }}>
                ● {activeCount > 0 ? t('c.live') : t('footer.status')}
              </span>
              <button className="ctrl-btn" onClick={() => resetMockData()} title={t('c.reset')}>
                ↺ {t('c.reset')}
              </button>
              <div className="seg">
                {(['en', 'zh'] as Lang[]).map((l) => (
                  <button
                    key={l}
                    className={`ctrl-btn${lang === l ? ' on' : ''}`}
                    onClick={() => setLang(l)}
                  >
                    {l === 'en' ? 'EN' : '中文'}
                  </button>
                ))}
              </div>
              <button className="ctrl-btn" onClick={toggleTheme}>
                {theme === 'dark' ? `◐ ${t('theme.dark')}` : `◑ ${t('theme.light')}`}
              </button>
            </div>
          </div>

          <main className="content">
            <Suspense fallback={<div className="route-loading">{t('c.loading')}</div>}>
              <Outlet />
            </Suspense>
          </main>

          <footer className="footer">
            <span>{t('footer.built')}</span>
            <span className="blink">● {t('footer.status')}</span>
          </footer>
        </div>
      </div>
    </>
  );
}
