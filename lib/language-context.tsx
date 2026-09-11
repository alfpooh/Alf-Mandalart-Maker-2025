"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"
import translations from "./translations.json"
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  languageCookie,
  parseLanguage,
} from "./language"
import type { Language } from "./types"

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({
  children,
  /** Resolved on the server from the cookie, so the first render is correct. */
  initial = DEFAULT_LANGUAGE,
}: {
  children: React.ReactNode
  initial?: Language
}) {
  const [language, setLanguageState] = useState<Language>(initial)

  // A choice made before the cookie existed still lives in storage. Adopt it
  // once, writing the cookie, so the next request is server-rendered right.
  useEffect(() => {
    if (typeof document === "undefined") return
    try {
      const stored = parseLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY))
      if (stored && stored !== initial) {
        setLanguageState(stored)
        document.cookie = languageCookie(stored)
      }
    } catch {
      // Private windows and blocked site data throw on access.
    }
  }, [initial])

  // The document itself has to move too: <html lang> is what a screen reader
  // switches voice on, and the title is what the tab and history show.
  useEffect(() => {
    if (typeof document === "undefined") return
    document.documentElement.lang = language
    const title = translations[language]?.app?.title
    if (title) document.title = title
  }, [language])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
    } catch {
      // Storage is optional; the cookie is what the server reads.
    }
    if (typeof document !== "undefined") document.cookie = languageCookie(lang)
  }

  const t = (key: string, vars?: Record<string, string | number>): string => {
    const keys = key.split(".")
    let value: any = translations[language]

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k]
      } else {
        console.warn(`Translation key not found: ${key}`)
        return key
      }
    }

    if (typeof value !== "string") return key
    if (!vars) return value

    // Placeholders rather than concatenation at the call site: "Confirm action
    // 1", "액션 1 확인" and "Vahvista toimenpide 1" put the number in three
    // different places, so the order has to belong to the translation.
    return value.replace(/\{(\w+)\}/g, (whole, name) =>
      name in vars ? String(vars[name]) : whole,
    )
  }

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}
