"use client"

import { useLanguage } from "@/lib/language-context"

type Language = "ko" | "en" | "fi"

const languages: { code: Language; flag: string; name: string }[] = [
  { code: "ko", flag: "🇰🇷", name: "한국어" },
  { code: "en", flag: "🇬🇧", name: "English" },
  { code: "fi", flag: "🇫🇮", name: "Suomi" },
]

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage()

  return (
    <div className="fixed top-4 right-4 z-50 flex gap-2">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLanguage(lang.code)}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl transition-all duration-200 hover:scale-110 ${
              language === lang.code
                ? "ring-4 ring-blue-500 shadow-lg scale-110"
                : "ring-2 ring-gray-300 hover:ring-gray-400"
            }
            bg-white
          `}
          title={lang.name}
          aria-label={`Switch to ${lang.name}`}
        >
          {lang.flag}
        </button>
      ))}
    </div>
  )
}
