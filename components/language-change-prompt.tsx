"use client"

import { Languages, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useLanguage } from "@/lib/language-context"
import type { Language } from "@/lib/types"

/**
 * Offered when the screen language no longer matches the plan's own.
 *
 * Switching the interface used to leave a Korean plan sitting under an English
 * UI with no way to reconcile the two. Translating is offered rather than done:
 * it overwrites text the user wrote, so it needs an explicit yes, and declining
 * has to be a real answer that is not asked again.
 */
export function LanguageChangePrompt({
  source,
  target,
  busy,
  error,
  onTranslate,
  onKeep,
}: {
  /** The language the plan's content is in. */
  source: Language
  /** The language now selected for the interface. */
  target: Language
  busy: boolean
  /** Already translated, or null. */
  error: string | null
  onTranslate: () => void
  onKeep: () => void
}) {
  const { t } = useLanguage()

  return (
    <Card className="mx-auto mb-4 max-w-4xl border-indigo-300 bg-indigo-50">
      <CardContent className="flex flex-wrap items-start gap-3 p-4">
        <Languages className="mt-0.5 h-5 w-5 flex-none text-indigo-700" aria-hidden="true" />
        <div className="min-w-[12rem] flex-1">
          <p className="font-medium text-indigo-950">
            {t("language.changed.title", { target: t(`language.name.${target}`) })}
          </p>
          <p className="mt-1 text-sm text-indigo-900">
            {t("language.changed.body", { source: t(`language.name.${source}`) })}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onKeep} disabled={busy}>
            {t("language.changed.uiOnly")}
          </Button>
          <Button size="sm" onClick={onTranslate} disabled={busy}>
            {busy && (
              <Loader2
                className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {busy ? t("language.changed.translating") : t("language.changed.translate")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
