"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"

import { AnalyzingOrder } from "@/components/analyzing-order"
import { DetailedActionsReview } from "@/components/detailed-actions-review"
import { GeneratingActions } from "@/components/generating-actions"
import { MandalartVisualization } from "@/components/mandalart-visualization"
import { SubgoalReview } from "@/components/subgoal-review"
import { analyzeAllDependencies, generateAllActions } from "@/lib/actions"
import { useLanguage } from "@/lib/language-context"
import {
  confirmAllActions,
  confirmAllSubgoals,
  deleteDraft,
  loadDraft,
  patchAction,
  patchSubgoal,
  removeDependency,
  saveDraft,
  withActions,
  withDependencies,
} from "@/lib/store/local-drafts"
import type { EditorDraft } from "@/lib/types"
import type { SessionInfo } from "@/lib/plans"
import { TeaserSession } from "@/components/teaser-session"
import { markTeaserSeen, wasTeaserSeen } from "@/lib/store/local-drafts"

/**
 * One Mandalart, at whichever step it is on.
 *
 * The draft is read from the browser on mount and written back after every
 * change, so a refresh mid-flow resumes where the user was rather than losing
 * all 64 cells.
 */
export function PlanEditor({ session }: { session: SessionInfo }) {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { t } = useLanguage()

  const [draft, setDraft] = useState<EditorDraft | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading")
  const [failures, setFailures] = useState<number[]>([])
  const [analyzed, setAnalyzed] = useState<Set<string>>(new Set())
  const [showTeaser, setShowTeaser] = useState(false)

  // The teaser runs once a plan is finished, only for people who do not yet
  // have the features it shows, and only once per plan — a wall on every visit
  // costs more in return visits than it gains in sign-ups.
  useEffect(() => {
    if (!draft || draft.step !== "visualization") return
    if (session.signedIn || !session.configured) return
    if (wasTeaserSeen(draft.id)) return
    setShowTeaser(true)
    markTeaserSeen(draft.id)
  }, [draft, session.signedIn, session.configured])

  useEffect(() => {
    const found = loadDraft(params.id)
    setDraft(found)
    setStatus(found ? "ready" : "missing")
  }, [params.id])

  /** Applies a change and persists it in one step, so the two cannot drift. */
  const update = useCallback((change: (current: EditorDraft) => EditorDraft) => {
    setDraft((current) => (current ? saveDraft(change(current)) : current))
  }, [])

  /**
   * Applies generated actions onto the *current* draft, not the one captured
   * when generation started.
   *
   * A rate-limited call retries for a while, so results can land long after
   * the request went out. Merging them into a stale snapshot silently discards
   * whatever changed meanwhile — including earlier areas from the same batch,
   * which is how a run that produced six areas ended up storing one.
   */
  const runActionGeneration = useCallback(
    async (subgoals: string[], mainGoal: string, language: EditorDraft["language"]) => {
      const results = await generateAllActions(subgoals, mainGoal, language)

      setDraft((latest) => {
        if (!latest) return latest
        let next = latest
        const failed: number[] = []
        for (const result of results) {
          const subgoal = latest.subgoals[result.subgoalIndex]
          if (!subgoal) continue
          if (result.actions) next = withActions(next, subgoal.id, result.actions)
          else failed.push(result.subgoalIndex)
        }
        setFailures(failed)
        // Areas that failed can be retried on their own; the rest are usable.
        return saveDraft({ ...next, step: "review-actions" })
      })
    },
    [],
  )

  // Kicking work off from inside a state updater runs it twice under React's
  // development double-invoke, which doubles the API calls.
  const handleGenerateActions = useCallback(() => {
    if (!draft) return
    const started = saveDraft({ ...draft, step: "generating-actions" })
    setDraft(started)
    void runActionGeneration(
      started.subgoals.map((s) => s.content),
      started.mainGoal,
      started.language,
    )
  }, [draft, runActionGeneration])

  const runOrderAnalysis = useCallback(async (current: EditorDraft) => {
    const subgoals = current.subgoals.map((s) => ({ id: s.id, content: s.content }))
    const actions = Object.fromEntries(
      current.subgoals.map((s) => [
        s.id,
        (current.actions[s.id] ?? []).map((a) => ({ id: a.id, content: a.content })),
      ]),
    )

    const results = await analyzeAllDependencies(
      subgoals,
      actions,
      current.mainGoal,
      current.id,
      current.language,
    )

    const edges = results.flatMap((r) => r.dependencies ?? [])
    setAnalyzed(new Set(current.subgoals.map((s) => s.id)))
    // Merged onto the latest draft, for the same reason as action generation.
    setDraft((latest) =>
      latest
        ? saveDraft({ ...withDependencies(latest, edges), step: "visualization" })
        : latest,
    )
  }, [])

  const handleFinishReview = useCallback(() => {
    if (!draft) return
    const started = saveDraft({ ...draft, step: "analyzing-order" })
    setDraft(started)
    void runOrderAnalysis(started)
  }, [draft, runOrderAnalysis])

  if (status === "loading") {
    return <div className="min-h-screen" aria-busy="true" />
  }

  if (status === "missing" || !draft) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold">{t("plan.notFound.title")}</h1>
        <p className="text-muted-foreground max-w-md">{t("plan.notFound.body")}</p>
        <button
          onClick={() => router.push("/")}
          className="mt-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground"
        >
          {t("plan.notFound.start")}
        </button>
      </div>
    )
  }

  if (draft.step === "review-subgoals") {
    return (
      <SubgoalReview
        mainGoal={draft.mainGoal}
        subgoals={draft.subgoals}
        onSubgoalUpdate={(i, content) => update((d) => patchSubgoal(d, i, { content }))}
        onSubgoalConfirm={(i) =>
          update((d) => patchSubgoal(d, i, { isConfirmed: true, isEditing: false }))
        }
        onStartEdit={(i) => update((d) => patchSubgoal(d, i, { isEditing: true }))}
        onSaveEdit={(i) =>
          update((d) => patchSubgoal(d, i, { isEditing: false, isConfirmed: true }))
        }
        onAcceptAll={() => update(confirmAllSubgoals)}
        onAllConfirmed={handleGenerateActions}
      />
    )
  }

  if (draft.step === "analyzing-order") {
    return <AnalyzingOrder subgoals={draft.subgoals} done={analyzed} />
  }

  if (draft.step === "generating-actions") {
    return <GeneratingActions subgoals={draft.subgoals} actions={draft.actions} />
  }

  if (draft.step === "review-actions") {
    return (
      <DetailedActionsReview
        mainGoal={draft.mainGoal}
        subgoals={draft.subgoals}
        detailedActions={draft.actions}
        failedSubgoals={failures}
        onActionUpdate={(id, i, content) => update((d) => patchAction(d, id, i, { content }))}
        onActionConfirm={(id, i) =>
          update((d) => patchAction(d, id, i, { isConfirmed: true, isEditing: false }))
        }
        onStartEdit={(id, i) => update((d) => patchAction(d, id, i, { isEditing: true }))}
        onSaveEdit={(id, i) =>
          update((d) => patchAction(d, id, i, { isEditing: false, isConfirmed: true }))
        }
        onAcceptAllActions={(id) => update((d) => confirmAllActions(d, id))}
        onComplete={handleFinishReview}
        onRetrySubgoal={handleGenerateActions}
      />
    )
  }

  return (
    <>
      {showTeaser && (
        <TeaserSession draft={draft} onClose={() => setShowTeaser(false)} />
      )}
      <MandalartVisualization
        draft={draft}
        locked={session.configured && !session.signedIn}
        onBack={() => update((d) => ({ ...d, step: "review-actions" }))}
        onRestart={() => {
          deleteDraft(draft.id)
          router.push("/")
        }}
        onUpdateMainGoal={(content) => update((d) => ({ ...d, mainGoal: content }))}
        onUpdateSubgoal={(i, content) => update((d) => patchSubgoal(d, i, { content }))}
        onUpdateAction={(id, i, content) => update((d) => patchAction(d, id, i, { content }))}
        onRemoveDependency={(actionId, dependsOnId) =>
          update((d) => removeDependency(d, actionId, dependsOnId))
        }
        onShowTeaser={() => setShowTeaser(true)}
      />
    </>
  )
}
