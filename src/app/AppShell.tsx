import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Icon, ToastRegion, type IconName } from '../components/ui'
import { isAppLanguage, languageOptions } from '../i18n/types'
import { usePlatform } from '../state/PlatformContext'

const navItems = [
  { to: '/overview', key: 'overview', icon: 'grid' },
  { to: '/workers', key: 'workers', icon: 'worker' },
  { to: '/bots', key: 'bots', icon: 'bot' },
  { to: '/tasks', key: 'tasks', icon: 'tasks' },
  { to: '/schedules', key: 'schedules', icon: 'calendar' },
  { to: '/results', key: 'results', icon: 'file' },
] as const satisfies readonly { to: string; key: ModuleName; icon: IconName }[]

type ModuleName = 'overview' | 'tasks' | 'bots' | 'schedules' | 'results' | 'workers'

function currentModule(pathname: string): ModuleName {
  const candidate = pathname.split('/')[1]
  return navItems.some((item) => item.key === candidate) ? candidate as ModuleName : 'overview'
}

export default function AppShell() {
  const { t, i18n } = useTranslation(['common', 'shell'])
  const { state, showToast } = usePlatform()
  const location = useLocation()
  const navigate = useNavigate()
  const module = currentModule(location.pathname)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [query, setQuery] = useState(new URLSearchParams(location.search).get('q') || '')
  const noticeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setQuery(new URLSearchParams(location.search).get('q') || '')
    setNoticeOpen(false)
  }, [location.search])

  useEffect(() => {
    setMobileNavOpen(false)
    setNoticeOpen(false)
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [location.pathname])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobileNavOpen(false); setNoticeOpen(false) }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  const breadcrumb = useMemo(() => {
    const label = t(`shell:nav.${module}`)
    const parts = location.pathname.split('/').filter(Boolean)
    return parts.length > 1 ? `${label} / ${decodeURIComponent(parts[1])}` : label
  }, [location.pathname, module, t])

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const target = module === 'overview' ? '/tasks' : `/${module}`
    navigate(`${target}${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`)
  }

  const changeLanguage = (event: ChangeEvent<HTMLSelectElement>) => {
    if (isAppLanguage(event.target.value)) void i18n.changeLanguage(event.target.value)
  }

  const onlineWorkers = state.workers.filter((worker) => worker.status === 'online').length
  const runningTasks = state.tasks.filter((task) => ['dispatching', 'running', 'canceling'].includes(task.status)).length
  const activeLanguage = isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'zh-CN'

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">{t('shell:skipToContent')}</a>
    <aside id="primary-navigation" className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
      <NavLink to="/overview" className="brand" aria-label={t('shell:brandHome')}>
        <div className="brand-mark"><span/><span/><span/></div><div><strong>{t('shell:brandName')}</strong><small>BOT OPERATIONS</small></div>
      </NavLink>
      <nav className="side-nav" aria-label={t('shell:primaryNavigation')}>
        <p className="nav-caption">{t('shell:workspace')}</p>
        {navItems.map((item) => <NavLink key={item.to} to={item.to} onClick={() => setMobileNavOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon name={item.icon} size={19}/><span>{t(`shell:nav.${item.key}`)}</span>{item.to === '/tasks' && runningTasks > 0 && <em>{runningTasks}</em>}</NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="system-health"><div className="health-head"><span><i/>{t('shell:systemHealthy')}</span><b>99.96%</b></div><div className="health-track"><span style={{ width: `${state.workers.length ? (onlineWorkers / state.workers.length) * 100 : 0}%` }}/></div><p>{t('shell:workersOnline', { online: onlineWorkers, total: state.workers.length })}</p></div>
        <button className="profile-button" onClick={() => showToast('account')}><span className="avatar">{t('shell:avatarInitial')}</span><span><strong>{t('shell:administratorName')}</strong><small>{t('shell:administratorRole')}</small></span><Icon name="more" size={18}/></button>
      </div>
    </aside>
    {mobileNavOpen && <button className="nav-backdrop" aria-label={t('shell:closeNavigation')} onClick={() => setMobileNavOpen(false)}/>}

    <main className="main-content" id="main-content">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileNavOpen((open) => !open)} aria-label={t(mobileNavOpen ? 'shell:closeNavigation' : 'shell:openNavigation')} aria-controls="primary-navigation" aria-expanded={mobileNavOpen}><Icon name="grid"/></button>
        <div className="breadcrumb"><span>{t('shell:operationsCenter')}</span><Icon name="chevron" size={14}/><strong>{breadcrumb}</strong></div>
        <div className="top-actions">
          <form className="search-box" onSubmit={submitSearch}><Icon name="search" size={18}/><input aria-label={t(`shell:search.${module}`)} placeholder={t(`shell:search.${module}`)} value={query} onChange={(event) => setQuery(event.target.value)}/></form>
          <div className="notice-anchor" ref={noticeRef}>
            <button className="icon-button notification-button" aria-label={t('shell:notices')} aria-haspopup="true" aria-expanded={noticeOpen} onClick={() => setNoticeOpen((open) => !open)}><Icon name="bell" size={19}/><span/></button>
            {noticeOpen && <div className="notice-popover">
              <div className="popover-head"><strong>{t('shell:notices')}</strong><span>{t('shell:unreadCount', { count: 3 })}</span></div>
              <button onClick={() => navigate('/tasks?status=failed')}><i className="notice-danger"/><span><strong>{t('shell:noticeFailedTitle')}</strong><small>{t('shell:noticeFailedMeta')}</small></span></button>
              <button onClick={() => navigate('/tasks?status=partial_success')}><i className="notice-warn"/><span><strong>{t('shell:noticePartialTitle')}</strong><small>{t('shell:noticePartialMeta')}</small></span></button>
              <button onClick={() => navigate('/workers/worker-gz-02')}><i className="notice-info"/><span><strong>{t('shell:noticeWorkerTitle')}</strong><small>{t('shell:noticeWorkerMeta')}</small></span></button>
            </div>}
          </div>
          <label className="language-picker"><span className="sr-only">{t('language')}</span><select aria-label={t('language')} value={activeLanguage} onChange={changeLanguage}>{languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <button className="primary-button" aria-label={t('shell:newTask')} onClick={() => navigate('/tasks?new=1')}><Icon name="plus" size={17}/><span>{t('shell:newTask')}</span></button>
        </div>
      </header>
      <Outlet/>
    </main>
    <ToastRegion message={state.toast}/>
  </div>
}
