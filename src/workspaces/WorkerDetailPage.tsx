import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { DefinitionGrid, EmptyState, Icon, PageHeader, PanelHeader, ProgressBar, StatusBadge } from '../components/ui'
import { formatDateTime, formatNumber, formatPercent } from '../i18n/formatters'
import { usePlatform } from '../state/PlatformContext'
import { useDemoText } from '../i18n/demo'

export default function WorkerDetailPage() {
  const { t } = useTranslation(['workers', 'common'])
  const { workerId } = useParams()
  const { state, simulateWorkerOffline } = usePlatform()
  const demo = useDemoText()
  const worker = state.workers.find((item) => item.id === workerId)
  if (!worker) return <div className="page-body"><EmptyState title={t('workers:notFoundTitle')} description={t('workers:notFoundDescription')}/></div>
  const linkedTasks = state.tasks.filter((task) => task.worker_id === worker.id)
  const activeTasks = linkedTasks.filter((task) => ['dispatching','running'].includes(task.status))
  const load = worker.status === 'online' ? Math.round(worker.current_running / worker.max_concurrency * 100) : 0
  return <div className="page-body"><PageHeader eyebrow={worker.id} title={demo('workers', worker.id, 'name', worker.name)} description={t('workers:agentVersion', { hostname: worker.hostname, version: worker.version })} backTo="/workers" actions={<><StatusBadge status={worker.status}/><button className="secondary-button danger-button" disabled={worker.status === 'offline'} onClick={() => simulateWorkerOffline(worker.id)}><Icon name="activity" size={15}/>{t('workers:simulateHeartbeatTimeout')}</button></>}/>
    <div className="detail-layout"><section className="panel detail-main"><PanelHeader kicker={t('workers:capacityAndHealth')} title={t('workers:resourceStatus')}/><div className="worker-health-hero"><div><span>{t('workers:currentLoad')}</span><strong>{formatPercent(load)}</strong></div><ProgressBar value={load}/><p>{t('workers:slotAvailability', { running: formatNumber(worker.current_running), available: formatNumber(worker.free_slots) })}</p></div><div className="stat-strip">{[[t('workers:cpu'),formatPercent(worker.metrics.cpu)],[t('workers:memory'),formatPercent(worker.metrics.memory)],[t('workers:maximumConcurrency'),formatNumber(worker.max_concurrency)],[t('workers:currentRunning'),formatNumber(worker.current_running)],[t('workers:freeSlots'),formatNumber(worker.free_slots)]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><DefinitionGrid items={[[t('workers:status'),<StatusBadge status={worker.status}/>],[t('workers:lastHeartbeat'),formatDateTime(worker.last_heartbeat_at)],[t('workers:runtimes'),worker.runtimes.join(', ')],[t('workers:capabilities'),worker.capabilities.join(', ')],[t('workers:labels'),worker.labels.join(', ')],[t('workers:hostname'),worker.hostname]]}/></section><aside className="detail-side"><section className="panel side-card warning-card"><PanelHeader kicker={t('workers:showcaseSimulation')} title={t('workers:offlineImpactTitle')}/><p>{t('workers:offlineImpactDescription')}</p><ul><li>{t('workers:offlineImpactDispatching')}</li><li>{t('workers:offlineImpactRunning')}</li><li>{t('workers:offlineImpactError')}</li></ul><strong>{t('workers:affectedTasks', { count: activeTasks.length })}</strong></section></aside></div>
    <section className="panel workspace-panel spaced-panel"><PanelHeader kicker={t('workers:assignedExecutions')} title={t('workers:linkedTasks')}/>{linkedTasks.length ? <div className="simple-list">{linkedTasks.map((task) => <Link to={`/tasks/${task.id}`} key={task.id}><span><strong>{demo('tasks', task.id, 'name', task.name)}</strong><small>{task.id} · {formatDateTime(task.created_at)}</small></span><StatusBadge status={task.status}/><Icon name="chevron" size={15}/></Link>)}</div> : <EmptyState icon="tasks" title={t('workers:emptyLinkedTasksTitle')} description={t('workers:emptyLinkedTasksDescription')}/>}</section>
  </div>
}
