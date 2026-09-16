"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { GoalInput } from "@/components/goal-input"
import { RecentDrafts } from "@/components/recent-drafts"
import { generateSubgoals } from "@/lib/actions"
import { signInWithGoogle } from "@/lib/auth-actions"
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
import { settled } from "@/lib/settle"

/**
 * `authNotice` says why someone was sent here — a sign-in that failed, or a
 * page that needs an account — so the redirect is never silent.
 */
export function HomeScreen({ session, authNotice = null }: { session: SessionInfo; authNotice?: string | null }) {
  const router = useRouter()
  const { language, t } = useLanguage()

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<EditorDraft[]>([])
  const [ticket, setTicket] = useState<string | null>(null)
  // Kept after the address is cleaned up below, which renders this page again without the reason.
  const [notice] = useState(authNotice)
  const refreshed = useRef(false)

  useEffect(() => {
    purgeExpiredDrafts()
    setDrafts(listDrafts())
  }, [])

  useEffect(() => {
    if (!authNotice || refreshed.current) return
    refreshed.current = true
    // The header was drawn when the site first loaded and can still show the
    // account as signed in after the session ended; a refresh redraws it from
    // the session as it is now. The router runs these in order, so the refresh
    // is for the cleaned address and a reload does not show the note again.
    router.replace("/", { scroll: false })
    router.refresh()
  }, [authNotice, router])

  const handleGoalSubmit = async (goal: string) => {
    setIsLoading(true)
    setError(null)

    // The quota is claimed before any model call, so a refused request costs
    // nothing. A plan is ~17 calls; letting generation start and rejecting
    // afterwards would pay for work nobody receives.
    const created = await settled(createPlan(goal, language))
    if (!created.ok) {
      setError(created.error)
      setIsLoading(false)
      return
    }

    // One ticket for this run, so the queue can report where it stands.
    const ticket = newTicket()
    setTicket(ticket)
    const result = await settled(generateSubgoals(goal, language, ticket))
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
      {notice && (
        <div className="px-4">
          <div
            role="status"
            className="mx-auto mt-4 flex w-full max-w-2xl flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <p className="min-w-0 flex-1">{t(notice)}</p>
            {session.configured && !session.signedIn && (
              <form action={signInWithGoogle}>
                <button
                  type="submit"
                  className="inline-flex min-h-[40px] items-center rounded-md bg-gray-900 px-4 font-semibold text-white hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {t("auth.signIn")}
                </button>
              </form>
            )}
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
