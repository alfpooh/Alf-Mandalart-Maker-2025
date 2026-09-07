"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { AccountMenu } from "@/components/account-menu"
import { GoalInput } from "@/components/goal-input"
import { RecentDrafts } from "@/components/recent-drafts"
import { generateSubgoals } from "@/lib/actions"
import { useLanguage } from "@/lib/language-context"
import { createPlan, type SessionInfo } from "@/lib/plans"
import { newTicket } from "@/lib/ticket"
import {
  createDraftWithId,
  listDrafts,
  purgeExpiredDrafts,
  saveDraft,
  saveDraftToken,
} from "@/lib/store/local-drafts"
import type { EditorDraft } from "@/lib/types"

export function HomeScreen({ session }: { session: SessionInfo }) {
  const router = useRouter()
  const { language, t } = useLanguage()

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<EditorDraft[]>([])
  const [ticket, setTicket] = useState<string | null>(null)

  useEffect(() => {
    purgeExpiredDrafts()
    setDrafts(listDrafts())
  }, [])

  const handleGoalSubmit = async (goal: string) => {
    setIsLoading(true)
    setError(null)

    // The quota is claimed before any model call, so a refused request costs
    // nothing. A plan is ~17 calls; letting generation start and rejecting
    // afterwards would pay for work nobody receives.
    const created = await createPlan(goal, language)
    if (!created.ok) {
      setError(created.error)
      setIsLoading(false)
      return
    }

    // One ticket for this run, so the queue can report where it stands.
    const ticket = newTicket()
    setTicket(ticket)
    const result = await generateSubgoals(goal, language, ticket)
    if (!result.ok) {
      setError(result.error)
      setIsLoading(false)
      return
    }

    // The server picked the id when it has a row; otherwise the browser does.
    const planId = created.plan?.planId
    const draft = planId
      ? createDraftWithId(planId, goal, language, result.data)
      : createDraftWithId(crypto.randomUUID(), goal, language, result.data)

    if (created.plan?.draftToken) {
      saveDraftToken(draft.id, created.plan.draftToken)
    }

    saveDraft(draft)
    router.push(`/plan/${draft.id}`)
  }

  return (
    <>
      {session.configured && (
        <div className="border-b border-border bg-background">
          <div className="mx-auto flex max-w-7xl justify-end px-4 py-2">
            <AccountMenu session={session} />
          </div>
        </div>
      )}

      <GoalInput
        onGoalSubmit={handleGoalSubmit}
        isLoading={isLoading}
        error={error ? t(error) : null}
        ticketId={isLoading ? ticket : null}
      />

      {drafts.length > 0 && !isLoading && (
        <RecentDrafts drafts={drafts} onDeleted={() => setDrafts(listDrafts())} />
      )}
    </>
  )
}
