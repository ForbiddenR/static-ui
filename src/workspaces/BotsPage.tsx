import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, Icon, PageHeader, StatusBadge } from '../components/ui'
import { formatDateTime, formatNumber, formatPercent } from '../i18n/formatters'
import { usePlatform } from '../state/PlatformContext'
import { useDemoText } from '../i18n/demo'

export default function BotsPage() {
  const { t } = useTranslation(['bots', 'common'])
  const { state } = usePlatform()
  const demo = useDemoText()
  const [params] = useSearchParams()
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const query = (params.get('q') || '').toLowerCase()
  const filtered = useMemo(() => state.bots.filter((bot) => [bot.name, bot.code, bot.category, bot.description].join(' ').toLowerCase().includes(query) && (status === 'all' || bot.status === status) && (category === 'all' || bot.category === category)), [state.bots, query, status, category])
  const categories = [...new Set(state.bots.map((bot) => bot.category))]
  return <div className="page-body"><PageHeader eyebrow={t('bots:eyebrow')} title={t('bots:title')} description={t('bots:description')}/>
    <section className="panel workspace-panel"><div className="workspace-toolbar"><div className="status-tabs">{(['all', 'enabled', 'disabled', 'draft'] as const).map((key) => <button key={key} className={status === key ? 'active' : ''} onClick={() => setStatus(key)}>{key === 'all' ? t('bots:all') : t(`common:statuses.${key}`)}</button>)}</div><select aria-label={t('bots:categoryFilter')} value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">{t('bots:allCategories')}</option>{categories.map((item) => { const bot = state.bots.find((candidate) => candidate.category === item); return <option key={item} value={item}>{bot ? demo('bots', bot.id, 'category', item) : item}</option>})}</select></div>
      <div className="resource-card-grid">{filtered.map((bot) => { const version = state.botVersions.find((item) => item.id === bot.current_version_id); const tasks = state.tasks.filter((task) => task.bot_id === bot.id); const success = tasks.length ? Math.round(tasks.filter((task) => task.status === 'success').length / tasks.length * 100) : 0; return <Link className="resource-card bot-resource-card" to={`/bots/${bot.id}`} key={bot.id}><div className="resource-card-head"><span className="large-glyph"><Icon name="bot" size={23}/></span><StatusBadge status={bot.status}/></div><p className="resource-code">{bot.code}</p><h2>{demo('bots', bot.id, 'name', bot.name)}</h2><p>{demo('bots', bot.id, 'description', bot.description)}</p><div className="tag-row">{bot.tags.map((tag, index) => <span key={tag}>{demo('bots', bot.id, `tag${index}`, tag)}</span>)}</div><div className="resource-card-stats"><div><span>{t('bots:currentVersion')}</span><strong>{version?.version || t('common:none')}</strong></div><div><span>{t('bots:linkedTasks')}</span><strong>{formatNumber(tasks.length)}</strong></div><div><span>{t('bots:successRate')}</span><strong>{formatPercent(success)}</strong></div></div><div className="card-foot"><span>{t('bots:updatedAt', { category: demo('bots', bot.id, 'category', bot.category), date: formatDateTime(bot.updated_at) })}</span><Icon name="chevron" size={16}/></div></Link>})}</div>{!filtered.length && <EmptyState icon="bot" title={t('bots:emptyTitle')} description={t('bots:emptyDescription')}/>}
    </section>
  </div>
}
