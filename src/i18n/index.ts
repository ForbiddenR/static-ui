import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { enUS } from './locales/en-US'
import { zhCN } from './locales/zh-CN'
import { DEFAULT_LANGUAGE, isAppLanguage, LOCALE_STORAGE_KEY, type AppLanguage } from './types'

function storedLanguage(): AppLanguage {
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    return isAppLanguage(value) ? value : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

function updateDocument(language: AppLanguage): void {
  document.documentElement.lang = language
  const resources = language === 'en-US' ? enUS : zhCN
  document.title = resources.common.appTitle
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
  description?.setAttribute('content', resources.common.appDescription)
}

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
  lng: storedLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
})

updateDocument(isAppLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE)

i18n.on('languageChanged', (language) => {
  const nextLanguage = isAppLanguage(language) ? language : DEFAULT_LANGUAGE
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLanguage)
  } catch {
    // 本地存储不可用时仍允许本次会话切换语言。
  }
  updateDocument(nextLanguage)
})

export default i18n
