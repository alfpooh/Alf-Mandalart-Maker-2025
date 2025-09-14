"use client"

import { useLanguage, type Language } from "@/lib/language-context"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const languages: { code: Language; name: string; flag: string }[] = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "ko", name: "한국어", flag: "🇰🇷" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "fi", name: "Suomi", flag: "🇫🇮" },
]

export function LanguageSwitch() {
  const { language, setLanguage, t } = useLanguage()
  const currentLanguage = languages.find((lang) => lang.code === language)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-transparent">
          🌐
          <span className="hidden sm:inline">
            {currentLanguage?.flag} {currentLanguage?.name}
          </span>
          <span className="sm:hidden">{currentLanguage?.flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={language === lang.code ? "bg-accent" : ""}
          >
            <span className="mr-2">{lang.flag}</span>
            {lang.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
