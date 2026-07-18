import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './index'

type DemoEntity = 'bots' | 'botVersions' | 'tasks' | 'taskItems' | 'schedules' | 'scheduleRuns' | 'results' | 'workers'

type DemoResource = Record<string, unknown>

function valueAt(resource: DemoResource | undefined, path: readonly string[]): unknown {
  return path.reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as DemoResource)[part] : undefined, resource)
}

/** Returns a locale-specific demo value when one exists, otherwise the seed value. */
export function useDemoText() {
  const { i18n: activeI18n } = useTranslation()

  return useCallback((entity: DemoEntity, id: string, field: string, fallback: string): string => {
    const path = ['demo', entity, id, field]
    const current = valueAt(i18n.getDataByLanguage(activeI18n.resolvedLanguage || activeI18n.language) as DemoResource | undefined, path)
    const chinese = valueAt(i18n.getDataByLanguage('zh-CN') as DemoResource | undefined, path)
    return typeof current === 'string' ? current : typeof chinese === 'string' ? chinese : fallback
  }, [activeI18n.language, activeI18n.resolvedLanguage])
}
