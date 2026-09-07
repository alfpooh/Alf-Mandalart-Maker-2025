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

/**
 * One Mandalart, at whichever step it is on.
 *
 * The draft is read from the browser on mount and written back after every
 * change, so a refresh mid-flow resumes where the user was rather than losing
 * all 64 cells.
 */
export default function PlanPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { t } = useLanguage()

  const [draft, setDraft] = useState<EditorDraft | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading")
  const [failures, setFailures] = useState<number[]>([])
  const [analyzed, setAnalyzed] = useState<Set<string>>(new Set())

  useEffect(() => {
    const found = loadDraft(params.id)
    setDraft(found)
    setStatus(found ? "ready" : "missing")
  }, [params.id])

  /** Applies a change and persists it in one step, so the two cannot drift. */
  const update = useCallback((change: (current: EditorDraft) => EditorDraft) => {
    setDraft((current) => (current ? saveDraft(change(current)) : current))
  }, [])

  const runActionGeneration = useCallback(
    async (current: EditorDraft) => {
      const subgoals = current.subgoals.map((s) => s.content)
      const results = await generateAllActions(subgoals, current.mainGoal, current.language)

      let next = current
      const failed: number[] = []
      for (const result of results) {
        const subgoal = current.subgoals[result.subgoalIndex]
        if (!subgoal) continue
        if (result.actions) next = withActions(next, subgoal.id, result.actions)
        else failed.push(result.subgoalIndex)
      }

      setFailures(failed)
      // Areas that failed can be retried on their own; the rest are usable now.
      setDraft(saveDraft({ ...next, step: "review-actions" }))
    },
    [],
  )

  const handleGenerateActions = useCallback(() => {
    setDraft((current) => {
      if (!current) return current
      const generating = saveDraft({ ...current, step: "generating-actions" })
      void runActionGeneration(generating)
      return generating
    })
  }, [runActionGeneration])

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
    setDraft(saveDraft({ ...withDependencies(current, edges), step: "visualization" }))
  }, [])

  const handleFinishReview = useCallback(() => {
    setDraft((current) => {
      if (!current) return current
      const analyzing = saveDraft({ ...current, step: "analyzing-order" })
      void runOrderAnalysis(analyzing)
      return analyzing
    })
  }, [runOrderAnalysis])

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
    <MandalartVisualization
      draft={draft}
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
    />
  )
}
