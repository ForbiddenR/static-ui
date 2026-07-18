import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/ui'
import type { Schedule, ScheduleFormPayload } from '../domain/types'
import { formatNumber } from '../i18n/formatters'
import { usePlatform } from '../state/PlatformContext'
import { useDemoText } from '../i18n/demo'

type ScheduleFormState = Omit<ScheduleFormPayload, 'jitterSeconds'> & { jitterSeconds: string }
interface ScheduleFormProps { initial?: Schedule; onSubmit: (form: ScheduleFormPayload) => void; onCancel: () => void }

export default function ScheduleForm({ initial, onSubmit, onCancel }: ScheduleFormProps) {
  const { t } = useTranslation(['schedules', 'common'])
  const { state, showToast } = usePlatform()
  const demo = useDemoText()
  const [form, setForm] = useState<ScheduleFormState>({ name: initial?.name || t('schedules:defaultName'), description: initial?.description || '', botId: initial?.bot_id || 'bot-inventory', botVersionId: initial?.bot_version_id || '', cron: initial?.cron || '0 17 * * 1-5', timezone: initial?.timezone || 'Asia/Shanghai', jitterSeconds: String(initial?.jitter_seconds ?? 300), enabled: initial ? initial.status === 'enabled' : true })
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (form.cron.trim().split(/\s+/).length !== 5) { showToast('cronInvalid'); return }; onSubmit({ ...form, jitterSeconds: Number(form.jitterSeconds) }) }
  return <form className="modal-form" onSubmit={submit}>
    <label>{t('schedules:name')}<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label><label>{t('schedules:descriptionLabel')}<textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label>
    <div className="form-row"><label>{t('schedules:targetBot')}<select value={form.botId} onChange={(event) => setForm({ ...form, botId: event.target.value, botVersionId: '' })}>{state.bots.map((bot) => <option key={bot.id} value={bot.id}>{demo('bots', bot.id, 'name', bot.name)}{bot.status !== 'enabled' ? t('schedules:disabledBotSuffix') : ''}</option>)}</select></label><label>{t('schedules:fixedVersion')}<select value={form.botVersionId} onChange={(event) => setForm({ ...form, botVersionId: event.target.value })}><option value="">{t('schedules:currentVersionAtTrigger')}</option>{state.botVersions.filter((version) => version.bot_id === form.botId).map((version) => <option key={version.id} value={version.id}>{version.version}</option>)}</select></label></div>
    <div className="form-row"><label>{t('schedules:cronExpression')}<input required className="mono-input" value={form.cron} onChange={(event) => setForm({ ...form, cron: event.target.value })}/><small>{t('schedules:cronFormat')}</small></label><label>{t('schedules:timezone')}<select value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}><option>Asia/Shanghai</option><option>Asia/Hong_Kong</option><option>UTC</option></select></label></div>
    <div className="form-row"><label>{t('schedules:maximumJitter')}<select value={form.jitterSeconds} onChange={(event) => setForm({ ...form, jitterSeconds: event.target.value })}><option value="0">{t('schedules:noJitter')}</option><option value="300">{t('schedules:jitterRange', { seconds: formatNumber(300) })}</option><option value="1800">{t('schedules:jitterRange', { seconds: formatNumber(1800) })}</option></select></label><label className="check-label"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })}/><span>{t('schedules:enableOnSave')}</span></label></div>
    <div className="policy-note"><Icon name="activity" size={18}/><div><strong>{t('schedules:fixedPolicyTitle')}</strong><p>{t('schedules:fixedPolicyDescription')}</p></div></div><div className="schedule-preview"><span>{t('schedules:preview')}</span><div><time>{t('schedules:nominalTriggerPreview')}</time><i/><strong>{Number(form.jitterSeconds) ? t('schedules:actualSchedulePreviewJitter') : t('schedules:actualSchedulePreview')}</strong></div></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>{t('common:cancel')}</button><button type="submit" className="primary-button"><Icon name="check" size={15}/>{t('schedules:save')}</button></div>
  </form>
}
