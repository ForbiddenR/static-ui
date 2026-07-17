import { useState, type FormEvent } from 'react'
import { Icon } from '../components/ui'
import type { Schedule, ScheduleFormPayload } from '../domain/types'
import { usePlatform } from '../state/PlatformContext'

type ScheduleFormState = Omit<ScheduleFormPayload, 'jitterSeconds'> & { jitterSeconds: string }
interface ScheduleFormProps { initial?: Schedule; onSubmit: (form: ScheduleFormPayload) => void; onCancel: () => void }

export default function ScheduleForm({ initial, onSubmit, onCancel }: ScheduleFormProps) {
  const { state, showToast } = usePlatform()
  const [form, setForm] = useState<ScheduleFormState>({ name: initial?.name || '新的业务调度计划', description: initial?.description || '', botId: initial?.bot_id || 'bot-inventory', botVersionId: initial?.bot_version_id || '', cron: initial?.cron || '0 17 * * 1-5', timezone: initial?.timezone || 'Asia/Shanghai', jitterSeconds: String(initial?.jitter_seconds ?? 300), enabled: initial ? initial.status === 'enabled' : true })
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (form.cron.trim().split(/\s+/).length !== 5) { showToast('Cron 必须是标准 5 段表达式'); return }; onSubmit({ ...form, jitterSeconds: Number(form.jitterSeconds) }) }
  return <form className="modal-form" onSubmit={submit}>
    <label>计划名称<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label><label>说明<textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label>
    <div className="form-row"><label>目标 Bot<select value={form.botId} onChange={(event) => setForm({ ...form, botId: event.target.value, botVersionId: '' })}>{state.bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}{bot.status !== 'enabled' ? '（未启用）' : ''}</option>)}</select></label><label>固定版本<select value={form.botVersionId} onChange={(event) => setForm({ ...form, botVersionId: event.target.value })}><option value="">触发时使用当前版本</option>{state.botVersions.filter((version) => version.bot_id === form.botId).map((version) => <option key={version.id} value={version.id}>{version.version}</option>)}</select></label></div>
    <div className="form-row"><label>Cron 表达式<input required className="mono-input" value={form.cron} onChange={(event) => setForm({ ...form, cron: event.target.value })}/><small>minute hour day-of-month month day-of-week</small></label><label>时区<select value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}><option>Asia/Shanghai</option><option>Asia/Hong_Kong</option><option>UTC</option></select></label></div>
    <div className="form-row"><label>最大随机延迟<select value={form.jitterSeconds} onChange={(event) => setForm({ ...form, jitterSeconds: event.target.value })}><option value="0">不延迟</option><option value="300">0–300 秒</option><option value="1800">0–1,800 秒</option></select></label><label className="check-label"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })}/><span>保存后立即启用</span></label></div>
    <div className="policy-note"><Icon name="activity" size={18}/><div><strong>MVP 策略固定</strong><p>重叠执行采用 skip；错过触发采用 run_once，仅补跑一次。</p></div></div><div className="schedule-preview"><span>示例预览</span><div><time>理论触发 17:00</time><i/><strong>{Number(form.jitterSeconds) ? '实际计划 17:02' : '实际计划 17:00'}</strong></div></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>取消</button><button type="submit" className="primary-button"><Icon name="check" size={15}/>保存调度计划</button></div>
  </form>
}
