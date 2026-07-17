import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, Icon, PageHeader, StatusBadge } from '../components/ui'
import { usePlatform } from '../state/PlatformContext'

export default function BotsPage() {
  const { state } = usePlatform()
  const [params] = useSearchParams()
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const query = (params.get('q') || '').toLowerCase()
  const filtered = useMemo(() => state.bots.filter((bot) => [bot.name, bot.code, bot.category, bot.description].join(' ').toLowerCase().includes(query) && (status === 'all' || bot.status === status) && (category === 'all' || bot.category === category)), [state.bots, query, status, category])
  const categories = [...new Set(state.bots.map((bot) => bot.category))]
  return <div className="page-body"><PageHeader eyebrow="Automation definitions" title="Bot 管理" description="管理脚本定义、当前版本、默认运行要求与可用状态。"/>
    <section className="panel workspace-panel"><div className="workspace-toolbar"><div className="status-tabs">{[['all','全部'],['enabled','已启用'],['disabled','已停用'],['draft','草稿']].map(([key,label]) => <button key={key} className={status === key ? 'active' : ''} onClick={() => setStatus(key)}>{label}</button>)}</div><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">全部分类</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="resource-card-grid">{filtered.map((bot) => { const version = state.botVersions.find((item) => item.id === bot.current_version_id); const tasks = state.tasks.filter((task) => task.bot_id === bot.id); const success = tasks.length ? Math.round(tasks.filter((task) => task.status === 'success').length / tasks.length * 100) : 0; return <Link className="resource-card bot-resource-card" to={`/bots/${bot.id}`} key={bot.id}><div className="resource-card-head"><span className="large-glyph"><Icon name="bot" size={23}/></span><StatusBadge status={bot.status}/></div><p className="resource-code">{bot.code}</p><h2>{bot.name}</h2><p>{bot.description}</p><div className="tag-row">{bot.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><div className="resource-card-stats"><div><span>当前版本</span><strong>{version?.version || '—'}</strong></div><div><span>关联任务</span><strong>{tasks.length}</strong></div><div><span>成功率</span><strong>{success}%</strong></div></div><div className="card-foot"><span>{bot.category} · 更新于 {bot.updated_at}</span><Icon name="chevron" size={16}/></div></Link>})}</div>{!filtered.length && <EmptyState icon="bot" title="未找到 Bot" description="请调整搜索、状态或分类筛选。"/>}
    </section>
  </div>
}
