import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState, FilePicker, Icon, Modal, PageHeader, Pagination, ProgressBar, StatusBadge } from '../components/ui'
import { formatDateTime, formatNumber, formatPercent } from '../i18n/formatters'
import { usePlatform } from '../state/PlatformContext'
import { useDemoText } from '../i18n/demo'

const taskStatuses = ['all', 'active', 'pending', 'dispatching', 'running', 'success', 'partial_success', 'failed', 'canceled', 'timeout'] as const
const runTypes = ['manual', 'schedule', 'retry_all', 'retry_failed_items'] as const
export default function TasksPage() {
  const { t } = useTranslation(['tasks', 'common'])
  const { state, createTask, showToast } = usePlatform()
  const demo = useDemoText()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [workerFilter, setWorkerFilter] = useState('all')
  const [runTypeFilter, setRunTypeFilter] = useState('all')
  const defaultForm = () => ({ botId: 'bot-approval', name: t('tasks:create.defaultName'), owner: t('tasks:create.defaultOwner'), inputSummary: t('tasks:create.defaultInputSummary'), fileName: '' })
  const [form, setForm] = useState<{ botId: string; name: string; owner: string; inputSummary: string; fileName: string }>(defaultForm)
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
  const reset = () => { setParams({}); setWorkerFilter('all'); setRunTypeFilter('all'); setPage(1); showToast('filtersReset') }

  return <div className="page-body">
    <PageHeader eyebrow={t('tasks:page.eyebrow')} title={t('tasks:page.title')} description={t('tasks:page.description')} actions={<button className="primary-button" onClick={() => { setForm(defaultForm()); setParams((current) => { const copy = new URLSearchParams(current); copy.set('new', '1'); return copy }) }}><Icon name="plus" size={16}/>{t('tasks:actions.new')}</button>}/>
    <section className="panel workspace-panel">
      <div className="workspace-toolbar">
        <div className="status-tabs">{taskStatuses.map((key) => <button key={key} className={key === 'active' ? (activeOnly ? 'active' : '') : (!activeOnly && status === key ? 'active' : '')} onClick={() => setStatus(key)}>{key === 'all' || key === 'active' ? t(`tasks:statusFilters.${key}`) : t(`common:statuses.${key}`)}</button>)}</div>
        <div className="filter-selects"><select aria-label={t('tasks:filters.botAriaLabel')} value={botFilter} onChange={(event) => { const copy = new URLSearchParams(params); if (event.target.value === 'all') copy.delete('bot'); else copy.set('bot', event.target.value); copy.delete('new'); setParams(copy); setPage(1) }}><option value="all">{t('tasks:filters.allBots')}</option>{state.bots.map((bot) => <option key={bot.id} value={bot.id}>{demo('bots', bot.id, 'name', bot.name)}</option>)}</select><select aria-label={t('tasks:filters.workerAriaLabel')} value={workerFilter} onChange={(event) => { setWorkerFilter(event.target.value); setPage(1) }}><option value="all">{t('tasks:filters.allWorkers')}</option>{state.workers.map((worker) => <option key={worker.id} value={worker.id}>{demo('workers', worker.id, 'name', worker.name)}</option>)}</select><select aria-label={t('tasks:filters.runTypeAriaLabel')} value={runTypeFilter} onChange={(event) => { setRunTypeFilter(event.target.value); setPage(1) }}><option value="all">{t('tasks:filters.allRunTypes')}</option>{runTypes.map((runType) => <option key={runType} value={runType}>{t(`common:runTypes.${runType}`)}</option>)}</select><button className="secondary-button" onClick={reset}><Icon name="filter" size={15}/>{t('tasks:actions.reset')}</button></div>
      </div>
      <div className="table-wrap"><table className="data-table task-workspace-table"><caption className="sr-only">{t('tasks:table.caption')}</caption><thead><tr><th>{t('tasks:table.taskBot')}</th><th>{t('tasks:table.status')}</th><th>{t('tasks:table.progress')}</th><th>{t('tasks:table.runType')}</th><th>{t('tasks:table.worker')}</th><th>{t('tasks:table.createdAt')}</th><th>{t('tasks:table.actions')}</th></tr></thead><tbody>{paged.map((task) => <tr key={task.id}><td><Link className="resource-link" to={`/tasks/${task.id}`}><strong>{demo('tasks', task.id, 'name', task.name)}</strong><small>{task.id} · {demo('bots', task.bot_id, 'name', task.bot_snapshot.name)}</small></Link></td><td><StatusBadge status={task.status}/></td><td><ProgressBar value={task.statistics.progress_rate} status={task.status}/><small className="cell-note">{t('tasks:table.progressSummary', { completed: formatNumber(task.statistics.completed_items), total: formatNumber(task.statistics.total_items), errorRate: formatPercent(task.statistics.error_rate) })}</small></td><td>{t(`common:runTypes.${task.run_type}`)}</td><td>{task.worker_id || t('tasks:table.awaitingAssignment')}</td><td><time>{formatDateTime(task.created_at)}</time></td><td><Link className="row-link" to={`/tasks/${task.id}`} aria-label={t('tasks:actions.viewTask', { name: demo('tasks', task.id, 'name', task.name) })}><Icon name="chevron" size={16}/></Link></td></tr>)}</tbody></table></div>
      {!paged.length && <EmptyState title={t('tasks:empty.title')} description={t('tasks:empty.description')}/>}
      <div className="workspace-foot"><span>{t('tasks:table.displaySummary', { displayed: formatNumber(paged.length), matched: formatNumber(filtered.length) })}</span><Pagination page={page} totalPages={totalPages} onChange={setPage}/></div>
    </section>

    <Modal open={modalOpen} onClose={closeModal} kicker={t('tasks:create.kicker')} title={t('tasks:create.title')}>
      <form className="modal-form" onSubmit={submit}>
        <label>{t('tasks:create.bot')}<select value={form.botId} onChange={(event) => setForm({ ...form, botId: event.target.value })}>{state.bots.map((bot) => <option key={bot.id} value={bot.id} disabled={bot.status !== 'enabled'}>{demo('bots', bot.id, 'name', bot.name)}{bot.status !== 'enabled' ? t('tasks:create.disabledBot') : ''}</option>)}</select></label>
        <label>{t('tasks:create.name')}<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label>
        <div className="form-row"><label>{t('tasks:create.owner')}<input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })}/></label><label>{t('tasks:create.inputSummary')}<input value={form.inputSummary} onChange={(event) => setForm({ ...form, inputSummary: event.target.value })}/></label></div>
        <FilePicker fileName={form.fileName} accept=".xlsx,.xls,.csv" hint={t('tasks:create.fileHint')} onFile={(file, error) => error ? showToast(error) : setForm({ ...form, fileName: file?.name || '' })}/>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeModal}>{t('common:cancel')}</button><button type="submit" className="primary-button"><Icon name="play" size={16}/>{t('tasks:actions.create')}</button></div>
      </form>
    </Modal>
  </div>
}
