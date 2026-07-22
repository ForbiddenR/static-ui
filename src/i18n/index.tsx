import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { en } from './en';
import { zh } from './zh';

export type Lang = 'en' | 'zh';

const dictionaries: Record<Lang, Record<string, string>> = { en, zh };

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (k) => k,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('botops-lang');
    return saved === 'zh' || saved === 'en' ? saved : 'en';
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem('botops-lang', l);
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  }, []);

  const t = useCallback(
    (key: string) => dictionaries[lang][key] ?? dictionaries.en[key] ?? key,
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
