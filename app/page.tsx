"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { GoalInput } from "@/components/goal-input"
import { RecentDrafts } from "@/components/recent-drafts"
import { generateSubgoals } from "@/lib/actions"
import { useLanguage } from "@/lib/language-context"
import {
  createDraft,
  listDrafts,
  purgeExpiredDrafts,
  saveDraft,
} from "@/lib/store/local-drafts"
import type { EditorDraft } from "@/lib/types"

/**
 * Entry screen: take the goal, generate the eight areas, hand off to the plan.
 *
 * The whole five-step flow used to live here behind `if (step === ...)`, which
 * left every screen on the same URL. Each Mandalart now gets its own route, so
 * back, refresh and bookmarks work.
 */
export default function HomePage() {
  const router = useRouter()
  const { language, t } = useLanguage()

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<EditorDraft[]>([])

  useEffect(() => {
    purgeExpiredDrafts()
    setDrafts(listDrafts())
  }, [])

  const handleGoalSubmit = async (goal: string) => {
    setIsLoading(true)
    setError(null)

    const result = await generateSubgoals(goal, language)

    if (!result.ok) {
      // The old code fabricated eight placeholder subgoals here and carried on.
      setError(result.error)
      setIsLoading(false)
      return
    }

    const draft = saveDraft(createDraft(goal, language, result.data))
    router.push(`/plan/${draft.id}`)
  }

  return (
    <>
      <GoalInput
        onGoalSubmit={handleGoalSubmit}
        isLoading={isLoading}
        error={error ? t(error) : null}
      />
      {drafts.length > 0 && !isLoading && (
        <RecentDrafts
          drafts={drafts}
          onDeleted={() => setDrafts(listDrafts())}
        />
      )}
    </>
  )
}
