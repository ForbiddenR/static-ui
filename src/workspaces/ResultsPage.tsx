import { useMemo, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, Icon, PageHeader, StatusBadge } from '../components/ui'
import { formatDateTime, formatFileSize, formatNumber } from '../i18n/formatters'
import { usePlatform } from '../state/PlatformContext'
import { useDemoText } from '../i18n/demo'

export default function ResultsPage() {
  const { t } = useTranslation(['results', 'common'])
  const { state, exportResults, downloadArtifact } = usePlatform()
  const demo = useDemoText()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<'results' | 'artifacts'>('results')
  const [type, setType] = useState('all')
  const query = (params.get('q') || '').toLowerCase()
  const results = useMemo(() => state.results.filter((result) => [result.id, result.task_id, result.key, result.type, JSON.stringify(result.data)].join(' ').toLowerCase().includes(query) && (type === 'all' || result.type === type)), [state.results, query, type])
  const artifacts = useMemo(() => state.artifacts.filter((artifact) => [artifact.id, artifact.task_id, artifact.name, artifact.type, artifact.content_type].join(' ').toLowerCase().includes(query) && (type === 'all' || artifact.type === type)), [state.artifacts, query, type])
  const types = tab === 'results' ? [...new Set(state.results.map((item) => item.type))] : [...new Set(state.artifacts.map((item) => item.type))]
  const selectTab = (next: 'results' | 'artifacts'): void => { setTab(next); setType('all') }
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'ArrowLeft' || event.key === 'Home' ? 'results' : 'artifacts'
    selectTab(next)
    document.getElementById(`results-tab-${next}`)?.focus()
  }
  const typeLabel = (value: string): string => {
    if (tab === 'results') return value === 'summary' ? t('common:resultTypes.summary') : t('common:resultTypes.record')
    if (value === 'screenshot') return t('common:artifactTypes.screenshot')
    return value === 'export' ? t('common:artifactTypes.export') : t('common:artifactTypes.download')
  }
  return <div className="page-body"><PageHeader eyebrow={t('results:eyebrow')} title={t('results:title')} description={t('results:description')} actions={tab === 'results' && <div className="heading-actions result-export-actions"><button className="secondary-button" disabled={!results.length} onClick={() => exportResults(results, 'json')}><Icon name="download" size={15}/>{t('results:exportJson')}</button><button className="primary-button" disabled={!results.length} onClick={() => exportResults(results, 'csv')}><Icon name="download" size={15}/>{t('results:exportCsv')}</button></div>}/>
    <nav className="detail-tabs" aria-label={t('results:typeTabs')} role="tablist"><button id="results-tab-results" role="tab" tabIndex={tab === 'results' ? 0 : -1} aria-selected={tab === 'results'} aria-controls="results-panel" className={tab === 'results' ? 'active' : ''} onKeyDown={handleTabKey} onClick={() => selectTab('results')}>{t('results:businessResults', { count: formatNumber(state.results.length) })}</button><button id="results-tab-artifacts" role="tab" tabIndex={tab === 'artifacts' ? 0 : -1} aria-selected={tab === 'artifacts'} aria-controls="artifacts-panel" className={tab === 'artifacts' ? 'active' : ''} onKeyDown={handleTabKey} onClick={() => selectTab('artifacts')}>{t('results:artifacts', { count: formatNumber(state.artifacts.length) })}</button></nav>
    <section className="panel workspace-panel" role="tabpanel" id={tab === 'results' ? 'results-panel' : 'artifacts-panel'} aria-labelledby={`results-tab-${tab}`}><div className="workspace-toolbar"><div><p className="panel-kicker">{tab === 'results' ? t('results:structuredData') : t('results:filesAndContent')}</p><h2>{tab === 'results' ? t('results:resultList') : t('results:artifactList')}</h2></div><select aria-label={t('results:typeFilter')} value={type} onChange={(event) => setType(event.target.value)}><option value="all">{t('results:allTypes')}</option>{types.map((item) => <option key={item}>{typeLabel(item)}</option>)}</select></div>
      {tab === 'results' ? <>{results.length ? <div className="result-grid large">{results.map((result) => { const bot = state.bots.find((item) => item.id === result.bot_id); return <article className="result-card" key={result.id}><div><StatusBadge status="success"/><code>{t(`common:resultTypes.${result.type}`)}</code></div><h3>{result.key}</h3><pre>{JSON.stringify(result.id === 'RES-0331-947' ? { ...result.data, title: demo('results', result.id, 'title', String(result.data.title || '')) } : result.data, null, 2)}</pre><footer><span>{result.id} · {bot ? demo('bots', bot.id, 'name', bot.name) : undefined}</span><div><Link to={`/tasks/${result.task_id}`}>{result.task_id}</Link>{result.task_item_id && <small>{result.task_item_id}</small>}</div></footer></article>})}</div> : <EmptyState icon="database" title={t('results:emptyResultsTitle')} description={t('results:emptyResultsDescription')}/>}</> : <>{artifacts.length ? <div className="artifact-gallery">{artifacts.map((artifact) => { const bot = state.bots.find((item) => item.id === artifact.bot_id); return <article key={artifact.id}><div className={`artifact-preview ${artifact.type}`}><Icon name={artifact.type === 'screenshot' ? 'eye' : 'file'} size={28}/><span>{t(`common:artifactTypes.${artifact.type}`)}</span></div><div className="artifact-meta"><div><strong>{artifact.name}</strong><small>{artifact.content_type} · {formatFileSize(artifact.size)}</small></div><code>{artifact.checksum}</code><p>{bot ? demo('bots', bot.id, 'name', bot.name) : t('results:crossTaskExport')} · {formatDateTime(artifact.created_at)}</p><div><Link className="text-button" to={artifact.task_id ? `/tasks/${artifact.task_id}` : '/results'}>{artifact.task_id || t('results:exportedResult')} <Icon name="chevron" size={13}/></Link><button className="secondary-button" onClick={() => downloadArtifact(artifact)}><Icon name="download" size={14}/>{t('common:download')}</button></div></div></article>})}</div> : <EmptyState icon="file" title={t('results:emptyArtifactsTitle')} description={t('results:emptyArtifactsDescription')}/>}</>}
    </section>
  </div>
}
