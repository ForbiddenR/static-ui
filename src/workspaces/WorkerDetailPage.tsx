import { Link, useParams } from 'react-router-dom'
import { DefinitionGrid, EmptyState, Icon, PageHeader, PanelHeader, ProgressBar, StatusBadge } from '../components/ui'
import { usePlatform } from '../state/PlatformContext'

export default function WorkerDetailPage() {
  const { workerId } = useParams()
  const { state, simulateWorkerOffline } = usePlatform()
  const worker = state.workers.find((item) => item.id === workerId)
  if (!worker) return <div className="page-body"><EmptyState title="Worker 不存在" description="该执行节点未注册。"/></div>
  const linkedTasks = state.tasks.filter((task) => task.worker_id === worker.id)
  const activeTasks = linkedTasks.filter((task) => ['dispatching','running'].includes(task.status))
  return <div className="page-body"><PageHeader eyebrow={worker.id} title={worker.name} description={`${worker.hostname} · Agent ${worker.version}`} backTo="/workers" actions={<><StatusBadge status={worker.status}/><button className="secondary-button danger-button" disabled={worker.status === 'offline'} onClick={() => simulateWorkerOffline(worker.id)}><Icon name="activity" size={15}/>模拟心跳超时</button></>}/>
    <div className="detail-layout"><section className="panel detail-main"><PanelHeader kicker="Capacity and health" title="资源状态"/><div className="worker-health-hero"><div><span>当前负载</span><strong>{worker.status === 'online' ? Math.round(worker.current_running / worker.max_concurrency * 100) : 0}%</strong></div><ProgressBar value={worker.status === 'online' ? Math.round(worker.current_running / worker.max_concurrency * 100) : 0}/><p>{worker.current_running} 个槽位运行中，{worker.free_slots} 个槽位可用。</p></div><div className="stat-strip">{[['CPU',`${worker.metrics.cpu}%`],['内存',`${worker.metrics.memory}%`],['最大并发',worker.max_concurrency],['当前运行',worker.current_running],['空闲槽位',worker.free_slots]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><DefinitionGrid items={[["状态",<StatusBadge status={worker.status}/>],["最近心跳",worker.last_heartbeat_at],["运行时",worker.runtimes.join(', ')],["能力",worker.capabilities.join(', ')],["标签",worker.labels.join(', ')],["主机名",worker.hostname]]}/></section><aside className="detail-side"><section className="panel side-card warning-card"><PanelHeader kicker="Showcase simulation" title="离线影响说明"/><p>此操作仅模拟 Master 检测到心跳超时，并不是 Worker 控制 API。</p><ul><li>dispatching 且未确认的任务退回 pending</li><li>running 任务转为 failed</li><li>错误码记录为 WORKER_OFFLINE</li></ul><strong>当前可能影响 {activeTasks.length} 个任务</strong></section></aside></div>
    <section className="panel workspace-panel spaced-panel"><PanelHeader kicker="Assigned executions" title="关联任务"/>{linkedTasks.length ? <div className="simple-list">{linkedTasks.map((task) => <Link to={`/tasks/${task.id}`} key={task.id}><span><strong>{task.name}</strong><small>{task.id} · {task.created_at}</small></span><StatusBadge status={task.status}/><Icon name="chevron" size={15}/></Link>)}</div> : <EmptyState icon="tasks" title="暂无关联任务" description="调度器尚未向该 Worker 分配演示任务。"/>}</section>
  </div>
}
