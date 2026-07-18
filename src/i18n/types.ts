export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'] as const

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: AppLanguage = 'zh-CN'
export const LOCALE_STORAGE_KEY = 'bot-task-platform.locale'

export const languageOptions: readonly { value: AppLanguage; label: string; shortLabel: string }[] = [
  { value: 'zh-CN', label: '中文', shortLabel: '中文' },
  { value: 'en-US', label: 'English', shortLabel: 'EN' },
]

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.includes(value as AppLanguage)
}
