import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, Icon, PageHeader, ProgressBar, StatusBadge } from '../components/ui'
import { usePlatform } from '../state/PlatformContext'
import type { IconName } from '../components/ui'

export default function WorkersPage() {
  const { state } = usePlatform()
  const [params] = useSearchParams()
  const [status, setStatus] = useState('all')
  const query = (params.get('q') || '').toLowerCase()
  const workers = useMemo(() => state.workers.filter((worker) => [worker.id, worker.name, worker.hostname, ...worker.capabilities, ...worker.labels].join(' ').toLowerCase().includes(query) && (status === 'all' || worker.status === status)), [state.workers, query, status])
  const online = state.workers.filter((worker) => worker.status === 'online')
  const freeSlots = online.reduce((sum, worker) => sum + worker.free_slots, 0)
  const summaryTiles: readonly [string, string | number, IconName][] = [['在线节点', `${online.length} / ${state.workers.length}`, 'worker'], ['可用槽位', freeSlots, 'activity'], ['平均 CPU', `${Math.round(online.reduce((sum, item) => sum + item.metrics.cpu, 0) / Math.max(online.length, 1))}%`, 'pulse']]
  return <div className="page-body"><PageHeader eyebrow="Execution resource pool" title="Worker 资源" description="查看执行节点健康度、容量、运行环境与当前任务。Worker 页面保持只读。"/>
    <section className="schedule-summary-grid">{summaryTiles.map(([label,value,icon]) => <article className="summary-tile" key={label}><span><Icon name={icon} size={18}/>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="panel workspace-panel"><div className="workspace-toolbar"><div className="status-tabs">{[['all','全部'],['online','在线'],['offline','离线']].map(([key,label]) => <button key={key} className={status === key ? 'active' : ''} onClick={() => setStatus(key)}>{label}</button>)}</div><span className="toolbar-note">调度器优先选择在线且负载更低的节点</span></div>
      <div className="worker-grid">{workers.map((worker) => <Link className="worker-card" to={`/workers/${worker.id}`} key={worker.id}><div className="worker-card-head"><span className="large-glyph"><Icon name="worker" size={22}/></span><StatusBadge status={worker.status}/></div><p className="resource-code">{worker.id}</p><h2>{worker.name}</h2><p>{worker.hostname} · Agent {worker.version}</p><div className="worker-capacity"><span>执行槽位 {worker.current_running} / {worker.max_concurrency}</span><ProgressBar value={worker.status === 'online' ? Math.round(worker.current_running / worker.max_concurrency * 100) : 100} status={worker.status === 'online' ? 'running' : 'failed'}/></div><div className="metric-pair"><div><span>CPU</span><strong>{worker.metrics.cpu}%</strong></div><div><span>内存</span><strong>{worker.metrics.memory}%</strong></div><div><span>空闲槽位</span><strong>{worker.free_slots}</strong></div></div><div className="tag-row">{worker.capabilities.map((item) => <span key={item}>{item}</span>)}</div><div className="card-foot"><span>心跳 {worker.last_heartbeat_at}</span><Icon name="chevron" size={16}/></div></Link>)}</div>{!workers.length && <EmptyState icon="worker" title="未找到 Worker" description="请调整搜索或在线状态筛选。"/>}
    </section>
  </div>
}
