"use client"

import { useLanguage } from "@/lib/language-context"
import { LANGUAGES, type Language } from "@/lib/types"

const NAMES: Record<Language, { native: string; short: string }> = {
  ko: { native: "한국어", short: "KO" },
  en: { native: "English", short: "EN" },
  fi: { native: "Suomi", short: "FI" },
}

/**
 * Language switch.
 *
 * Was three 28px circles holding 24px flag emoji, fixed to the top-right corner
 * — the glyphs overflowed their buttons, the targets were below the 44px
 * minimum, and being fixed meant they sat on top of whatever the page put in
 * that corner. Now a sticky bar in normal flow, so nothing is covered, with
 * language names rather than flags: a flag names a country, not a language.
 */
export function LanguageSelector() {
  const { language, setLanguage } = useLanguage()

  return (
    <div className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl justify-end px-4 py-2">
        <div
          role="radiogroup"
          aria-label="Language"
          className="inline-flex overflow-hidden rounded-md border border-border"
        >
          {LANGUAGES.map((code) => {
            const active = language === code
            return (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setLanguage(code)}
                title={NAMES[code].native}
                className={`min-h-[44px] min-w-[52px] px-3 text-sm font-medium transition-colors focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 ${
                  active
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                <span aria-hidden="true">{NAMES[code].short}</span>
                <span className="sr-only">{NAMES[code].native}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
