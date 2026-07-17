import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState, FilePicker, Icon, Modal, PageHeader, Pagination, ProgressBar, StatusBadge } from '../components/ui'
import { usePlatform } from '../state/PlatformContext'

const taskStatuses = [['all','全部'],['active','活跃'],['pending','等待中'],['dispatching','分配中'],['running','执行中'],['success','已成功'],['partial_success','部分成功'],['failed','失败'],['canceled','已取消'],['timeout','超时']]

export default function TasksPage() {
  const { state, createTask, showToast } = usePlatform()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [workerFilter, setWorkerFilter] = useState('all')
  const [runTypeFilter, setRunTypeFilter] = useState('all')
  const [form, setForm] = useState({ botId: 'bot-approval', name: '新的自动化任务', owner: '平台运营组', inputSummary: '使用默认运行参数', fileName: '' })
  const query = (params.get('q') || '').toLowerCase()
  const status = params.get('status') || 'all'
  const botParam = params.get('bot')
  const botFilter = botParam && state.bots.some((bot) => bot.id === botParam) ? botParam : 'all'
  const activeOnly = params.get('active') === '1'
  const modalOpen = params.get('new') === '1'

  useEffect(() => { setPage(1) }, [query, status, botFilter, activeOnly])

  const filtered = useMemo(() => state.tasks.filter((task) => {
    const haystack = [task.id, task.name, task.bot_snapshot.name, task.owner, task.error_message || ''].join(' ').toLowerCase()
    const matchesActivity = !activeOnly || ['pending', 'dispatching', 'running', 'canceling'].includes(task.status)
    return (!query || haystack.includes(query)) && (status === 'all' || task.status === status) && matchesActivity && (botFilter === 'all' || task.bot_id === botFilter) && (workerFilter === 'all' || task.worker_id === workerFilter) && (runTypeFilter === 'all' || task.run_type === runTypeFilter)
  }), [state.tasks, query, status, activeOnly, botFilter, workerFilter, runTypeFilter])
  const pageSize = 6
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const setStatus = (next: string): void => { const copy = new URLSearchParams(params); copy.delete('active'); if (next === 'active') { copy.delete('status'); copy.set('active', '1') } else if (next === 'all') copy.delete('status'); else copy.set('status', next); copy.delete('new'); setParams(copy); setPage(1) }
  const closeModal = () => { const copy = new URLSearchParams(params); copy.delete('new'); setParams(copy) }
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const id = createTask({ botId: form.botId, name: form.name, owner: form.owner, inputSource: form.fileName ? 'file' : 'params', inputSummary: form.fileName || form.inputSummary, totalItems: form.fileName ? 500 : 1 })
    closeModal()
    if (id) navigate(`/tasks/${id}`)
  }
  const reset = () => { setParams({}); setWorkerFilter('all'); setRunTypeFilter('all'); setPage(1); showToast('筛选条件已重置') }

  return <div className="page-body">
    <PageHeader eyebrow="Task operations" title="任务中心" description="追踪每一次 Bot 执行、业务明细、运行日志与结果产物。" actions={<button className="primary-button" onClick={() => setParams((current) => { const copy = new URLSearchParams(current); copy.set('new','1'); return copy })}><Icon name="plus" size={16}/>新建任务</button>}/>
    <section className="panel workspace-panel">
      <div className="workspace-toolbar">
        <div className="status-tabs">{taskStatuses.map(([key,label]) => <button key={key} className={key === 'active' ? (activeOnly ? 'active' : '') : (!activeOnly && status === key ? 'active' : '')} onClick={() => setStatus(key)}>{label}</button>)}</div>
        <div className="filter-selects"><select aria-label="按 Bot 筛选" value={botFilter} onChange={(event) => { const copy = new URLSearchParams(params); if (event.target.value === 'all') copy.delete('bot'); else copy.set('bot', event.target.value); copy.delete('new'); setParams(copy); setPage(1) }}><option value="all">全部 Bot</option>{state.bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select><select aria-label="按 Worker 筛选" value={workerFilter} onChange={(event) => { setWorkerFilter(event.target.value); setPage(1) }}><option value="all">全部 Worker</option>{state.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select><select aria-label="按运行方式筛选" value={runTypeFilter} onChange={(event) => { setRunTypeFilter(event.target.value); setPage(1) }}><option value="all">全部运行方式</option><option value="manual">手动</option><option value="schedule">调度</option><option value="retry_all">全部重试</option><option value="retry_failed_items">失败明细重试</option></select><button className="secondary-button" onClick={reset}><Icon name="filter" size={15}/>重置</button></div>
      </div>
      <div className="table-wrap"><table className="data-table task-workspace-table"><caption className="sr-only">任务列表</caption><thead><tr><th>任务 / Bot</th><th>状态</th><th>执行进度</th><th>运行方式</th><th>Worker</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{paged.map((task) => <tr key={task.id}><td><Link className="resource-link" to={`/tasks/${task.id}`}><strong>{task.name}</strong><small>{task.id} · {task.bot_snapshot.name}</small></Link></td><td><StatusBadge status={task.status}/></td><td><ProgressBar value={task.statistics.progress_rate} status={task.status}/><small className="cell-note">{task.statistics.completed_items} / {task.statistics.total_items} · 错误率 {task.statistics.error_rate}%</small></td><td>{task.run_type === 'schedule' ? '调度触发' : task.run_type.includes('retry') ? '重试任务' : '手动执行'}</td><td>{task.worker_id || '等待分配'}</td><td><time>{task.created_at}</time></td><td><Link className="row-link" to={`/tasks/${task.id}`} aria-label={`查看 ${task.name}`}><Icon name="chevron" size={16}/></Link></td></tr>)}</tbody></table></div>
      {!paged.length && <EmptyState title="未找到匹配的任务" description="请调整搜索或筛选条件。"/>}
      <div className="workspace-foot"><span>当前显示 {paged.length} 条，共匹配 {filtered.length} 条任务</span><Pagination page={page} totalPages={totalPages} onChange={setPage}/></div>
    </section>

    <Modal open={modalOpen} onClose={closeModal} kicker="Manual execution" title="新建自动化任务">
      <form className="modal-form" onSubmit={submit}>
        <label>选择 Bot<select value={form.botId} onChange={(event) => setForm({ ...form, botId: event.target.value })}>{state.bots.map((bot) => <option key={bot.id} value={bot.id} disabled={bot.status !== 'enabled'}>{bot.name}{bot.status !== 'enabled' ? '（未启用）' : ''}</option>)}</select></label>
        <label>任务名称<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label>
        <div className="form-row"><label>所属部门<input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })}/></label><label>参数摘要<input value={form.inputSummary} onChange={(event) => setForm({ ...form, inputSummary: event.target.value })}/></label></div>
        <FilePicker fileName={form.fileName} accept=".xlsx,.xls,.csv" hint="支持 Excel、CSV，单个文件不超过 50 MB" onFile={(file, error) => error ? showToast(error) : setForm({ ...form, fileName: file?.name || '' })}/>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeModal}>取消</button><button type="submit" className="primary-button"><Icon name="play" size={16}/>创建任务</button></div>
      </form>
    </Modal>
  </div>
}
