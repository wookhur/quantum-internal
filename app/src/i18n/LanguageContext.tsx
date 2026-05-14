import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { ko, en, type TranslationKeys } from './translations'

export type Language = 'ko' | 'en'

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKeys | (string & {}), params?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const translations: Record<Language, Record<string, string>> = { ko, en }

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('qa-lang')
    return (saved === 'en' || saved === 'ko') ? saved : 'ko'
  })

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem('qa-lang', lang)
  }, [])

  const t = useCallback(
    (key: TranslationKeys | (string & {}), params?: Record<string, string | number>): string => {
      let text = translations[language][key] || translations.ko[key] || key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, String(v))
        }
      }
      return text
    },
    [language],
  )

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}

/** Shortcut for just the t function */
export function useT() {
  return useLanguage().t
}
