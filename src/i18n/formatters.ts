import i18n from './index'
import { DEFAULT_LANGUAGE, isAppLanguage, type AppLanguage } from './types'

function language(): AppLanguage {
  return isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LANGUAGE
}

function parseDemoDate(value: string): Date | null {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}+08:00`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(value: string | null, withSeconds = false): string {
  if (!value) return '—'
  const date = parseDemoDate(value)
  if (!date) return value
  return new Intl.DateTimeFormat(language(), {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: withSeconds ? '2-digit' : undefined,
    hour12: false,
  }).format(date)
}

export function formatTime(value: string | null): string {
  if (!value) return '—'
  const date = parseDemoDate(value)
  if (!date) return value
  return new Intl.DateTimeFormat(language(), {
    timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(language(), { maximumFractionDigits }).format(value)
}

export function formatPercent(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(language(), { style: 'percent', maximumFractionDigits }).format(value / 100)
}

export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return '—'
  if (milliseconds < 1000) return `${formatNumber(milliseconds)} ms`
  return `${formatNumber(milliseconds / 1000, 1)} s`
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${formatNumber(value, unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}
