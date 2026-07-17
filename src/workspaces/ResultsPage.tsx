import { useMemo, useState, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, Icon, PageHeader, StatusBadge } from '../components/ui'
import { usePlatform } from '../state/PlatformContext'

export default function ResultsPage() {
  const { state, exportResults, downloadArtifact } = usePlatform()
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
  return <div className="page-body"><PageHeader eyebrow="Business output center" title="结果与附件" description="区分结构化业务结果与可下载文件，并保留其 Task / TaskItem 来源。" actions={tab === 'results' && <div className="heading-actions result-export-actions"><button className="secondary-button" disabled={!results.length} onClick={() => exportResults(results, 'json')}><Icon name="download" size={15}/>导出 JSON</button><button className="primary-button" disabled={!results.length} onClick={() => exportResults(results, 'csv')}><Icon name="download" size={15}/>导出 CSV</button></div>}/>
    <nav className="detail-tabs" aria-label="结果类型" role="tablist"><button id="results-tab-results" role="tab" tabIndex={tab === 'results' ? 0 : -1} aria-selected={tab === 'results'} aria-controls="results-panel" className={tab === 'results' ? 'active' : ''} onKeyDown={handleTabKey} onClick={() => selectTab('results')}>业务结果 {state.results.length}</button><button id="results-tab-artifacts" role="tab" tabIndex={tab === 'artifacts' ? 0 : -1} aria-selected={tab === 'artifacts'} aria-controls="artifacts-panel" className={tab === 'artifacts' ? 'active' : ''} onKeyDown={handleTabKey} onClick={() => selectTab('artifacts')}>附件 {state.artifacts.length}</button></nav>
    <section className="panel workspace-panel" role="tabpanel" id={tab === 'results' ? 'results-panel' : 'artifacts-panel'} aria-labelledby={`results-tab-${tab}`}><div className="workspace-toolbar"><div><p className="panel-kicker">{tab === 'results' ? 'Structured data' : 'Files and large content'}</p><h2>{tab === 'results' ? 'Result 列表' : 'Artifact 列表'}</h2></div><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">全部类型</option>{types.map((item) => <option key={item}>{item}</option>)}</select></div>
      {tab === 'results' ? <>{results.length ? <div className="result-grid large">{results.map((result) => { const bot = state.bots.find((item) => item.id === result.bot_id); return <article className="result-card" key={result.id}><div><StatusBadge status="success"/><code>{result.type}</code></div><h3>{result.key}</h3><pre>{JSON.stringify(result.data, null, 2)}</pre><footer><span>{result.id} · {bot?.name}</span><div><Link to={`/tasks/${result.task_id}`}>{result.task_id}</Link>{result.task_item_id && <small>{result.task_item_id}</small>}</div></footer></article>})}</div> : <EmptyState icon="database" title="未找到业务结果" description="请调整搜索或结果类型筛选。"/>}</> : <>{artifacts.length ? <div className="artifact-gallery">{artifacts.map((artifact) => { const bot = state.bots.find((item) => item.id === artifact.bot_id); return <article key={artifact.id}><div className={`artifact-preview ${artifact.type}`}><Icon name={artifact.type === 'screenshot' ? 'eye' : 'file'} size={28}/><span>{artifact.type}</span></div><div className="artifact-meta"><div><strong>{artifact.name}</strong><small>{artifact.content_type} · {(artifact.size/1024).toFixed(1)} KB</small></div><code>{artifact.checksum}</code><p>{bot?.name || '跨任务导出'} · {artifact.created_at}</p><div><Link className="text-button" to={artifact.task_id ? `/tasks/${artifact.task_id}` : '/results'}>{artifact.task_id || '导出结果'} <Icon name="chevron" size={13}/></Link><button className="secondary-button" onClick={() => downloadArtifact(artifact)}><Icon name="download" size={14}/>下载</button></div></div></article>})}</div> : <EmptyState icon="file" title="未找到附件" description="结果导出后会在这里生成新的 Artifact。"/>}</>}
    </section>
  </div>
}
