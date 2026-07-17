import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Icon, ToastRegion, type IconName } from '../components/ui'
import { usePlatform } from '../state/PlatformContext'

const navItems: { to: string; label: string; icon: IconName }[] = [
  { to: '/overview', label: '运行总览', icon: 'grid' },
  { to: '/tasks', label: '任务中心', icon: 'tasks' },
  { to: '/bots', label: 'Bot 管理', icon: 'bot' },
  { to: '/schedules', label: '调度计划', icon: 'calendar' },
  { to: '/results', label: '结果与附件', icon: 'file' },
  { to: '/workers', label: 'Worker 资源', icon: 'worker' },
]

const moduleMeta = {
  overview: ['运行总览', '搜索任务、Bot 或部门'],
  tasks: ['任务中心', '搜索任务、Bot、部门或错误'],
  bots: ['Bot 管理', '搜索 Bot、编码或分类'],
  schedules: ['调度计划', '搜索计划、Bot 或 cron'],
  results: ['结果与附件', '搜索业务键、任务或文件'],
  workers: ['Worker 资源', '搜索 Worker、主机或能力'],
}

type ModuleName = keyof typeof moduleMeta

function currentModule(pathname: string): ModuleName {
  const candidate = pathname.split('/')[1]
  return candidate && Object.hasOwn(moduleMeta, candidate) ? candidate as ModuleName : 'overview'
}

export default function AppShell() {
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
    const label = moduleMeta[module]?.[0] || '运行总览'
    const parts = location.pathname.split('/').filter(Boolean)
    return parts.length > 1 ? `${label} / ${decodeURIComponent(parts[1])}` : label
  }, [location.pathname, module])

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const target = module === 'overview' ? '/tasks' : `/${module}`
    navigate(`${target}${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`)
  }

  const onlineWorkers = state.workers.filter((worker) => worker.status === 'online').length
  const runningTasks = state.tasks.filter((task) => ['dispatching', 'running', 'canceling'].includes(task.status)).length

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <aside id="primary-navigation" className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
      <NavLink to="/overview" className="brand" aria-label="衡枢运行总览">
        <div className="brand-mark"><span/><span/><span/></div><div><strong>衡枢</strong><small>BOT OPERATIONS</small></div>
      </NavLink>
      <nav className="side-nav" aria-label="主导航">
        <p className="nav-caption">工作台</p>
        {navItems.map((item) => <NavLink key={item.to} to={item.to} onClick={() => setMobileNavOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon name={item.icon} size={19}/><span>{item.label}</span>{item.to === '/tasks' && runningTasks > 0 && <em>{runningTasks}</em>}</NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="system-health"><div className="health-head"><span><i/>系统运行正常</span><b>99.96%</b></div><div className="health-track"><span style={{ width: `${state.workers.length ? (onlineWorkers / state.workers.length) * 100 : 0}%` }}/></div><p>{onlineWorkers} / {state.workers.length} 个 Worker 在线 · 演示时钟 10:48</p></div>
        <button className="profile-button" onClick={() => showToast('当前账号：平台管理员')}><span className="avatar">陈</span><span><strong>陈默</strong><small>平台管理员</small></span><Icon name="more" size={18}/></button>
      </div>
    </aside>
    {mobileNavOpen && <button className="nav-backdrop" aria-label="关闭导航" onClick={() => setMobileNavOpen(false)}/>}

    <main className="main-content" id="main-content">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileNavOpen((open) => !open)} aria-label={mobileNavOpen ? '关闭导航' : '打开导航'} aria-controls="primary-navigation" aria-expanded={mobileNavOpen}><Icon name="grid"/></button>
        <div className="breadcrumb"><span>自动化运营中心</span><Icon name="chevron" size={14}/><strong>{breadcrumb}</strong></div>
        <div className="top-actions">
          <form className="search-box" onSubmit={submitSearch}><Icon name="search" size={18}/><input aria-label={moduleMeta[module]?.[1]} placeholder={moduleMeta[module]?.[1]} value={query} onChange={(event) => setQuery(event.target.value)}/></form>
          <div className="notice-anchor" ref={noticeRef}>
            <button className="icon-button notification-button" aria-label="运行提醒" aria-haspopup="true" aria-expanded={noticeOpen} onClick={() => setNoticeOpen((open) => !open)}><Icon name="bell" size={19}/><span/></button>
            {noticeOpen && <div className="notice-popover">
              <div className="popover-head"><strong>运行提醒</strong><span>3 条未读</span></div>
              <button onClick={() => navigate('/tasks?status=failed')}><i className="notice-danger"/><span><strong>价格监控任务执行失败</strong><small>数据源登录状态已失效 · 6 分钟前</small></span></button>
              <button onClick={() => navigate('/tasks?status=partial_success')}><i className="notice-warn"/><span><strong>公告采集部分成功</strong><small>13 条记录等待重试 · 1 小时前</small></span></button>
              <button onClick={() => navigate('/workers/worker-gz-02')}><i className="notice-info"/><span><strong>Worker 已恢复在线</strong><small>worker-gz-02 · 2 小时前</small></span></button>
            </div>}
          </div>
          <button className="primary-button" aria-label="新建任务" onClick={() => navigate('/tasks?new=1')}><Icon name="plus" size={17}/><span>新建任务</span></button>
        </div>
      </header>
      <Outlet/>
    </main>
    <ToastRegion message={state.toast}/>
  </div>
}
