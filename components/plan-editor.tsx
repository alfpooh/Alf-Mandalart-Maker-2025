"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { useParams, useRouter } from "next/navigation"

import { AnalyzingOrder } from "@/components/analyzing-order"
import { DetailedActionsReview } from "@/components/detailed-actions-review"
import { GeneratingActions } from "@/components/generating-actions"
import { MandalartVisualization } from "@/components/mandalart-visualization"
import { StepProgress } from "@/components/step-progress"
import { SubgoalReview } from "@/components/subgoal-review"
import {
  analyzeDependencies,
  generateActionsForSubgoal,
  translatePlanText,
} from "@/lib/actions"
import { useLanguage } from "@/lib/language-context"
import {
  addAction,
  confirmAllActions,
  confirmAllSubgoals,
  loadDraft,
  patchAction,
  patchSubgoal,
  removalOf,
  removeAction,
  removeDependency,
  restoreAction,
  saveDraft,
  withActions,
  withDependencies,
} from "@/lib/store/local-drafts"
import type { RemovedAction } from "@/lib/store/local-drafts"
import type { AppStep, EditorDraft } from "@/lib/types"
import type { SessionInfo } from "@/lib/plans"
import { newTicket } from "@/lib/ticket"
import { isBusy, setBusy, subscribeBusy } from "@/lib/busy"
import { TeaserSession } from "@/components/teaser-session"
import { markTeaserSeen, wasTeaserSeen } from "@/lib/store/local-drafts"
import { settled } from "@/lib/settle"
import { LanguageChangePrompt } from "@/components/language-change-prompt"
import { applyTranslations, draftToStrings } from "@/lib/translate-draft"
import type { Language } from "@/lib/types"
import { normalizeCell, normalizeContent } from "@/lib/validation"

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
  const { t, language: uiLanguage } = useLanguage()

  const [draft, setDraft] = useState<EditorDraft | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading")
  const [failures, setFailures] = useState<number[]>([])
  const [analyzed, setAnalyzed] = useState<Set<string>>(new Set())
  const [regeneratingArea, setRegeneratingArea] = useState<number | null>(null)
  const [areaError, setAreaError] = useState<string | null>(null)
  const [showTeaser, setShowTeaser] = useState(false)
  const [ticket, setTicket] = useState<string | null>(null)
  // Deleting used to be instant and final. The removed action is held here so
  // it can be put back with its metric, its position and its prerequisites.
  const [undoable, setUndoable] = useState<RemovedAction | null>(null)
  // A plan carries the language it was written in. When the interface moves
  // away from it, the user is asked once what to do, and "keep my text" is
  // remembered so the offer does not follow them around.
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)
  const [keptLanguage, setKeptLanguage] = useState<Language | null>(null)

  const busy = useSyncExternalStore(subscribeBusy, isBusy, () => false)

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

  // A run that is still in flight when this unmounts is abandoned either way;
  // what must not survive is the header believing one is active.
  useEffect(() => () => setBusy(false), [])

  /** How long the undo offer stands before the removal becomes permanent. */
  const UNDO_WINDOW_MS = 12_000

  useEffect(() => {
    if (!undoable) return
    const timer = setTimeout(() => setUndoable(null), UNDO_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [undoable])

  /** Applies a change and persists it in one step, so the two cannot drift. */
  const update = useCallback((change: (current: EditorDraft) => EditorDraft) => {
    setDraft((current) => (current ? saveDraft(change(current)) : current))
  }, [])

  /**
   * Generates each area separately and merges it the moment it lands.
   *
   * The eight requests go out together and the shared queue decides how many
   * actually run; merging per area means the screen fills in as work completes
   * rather than jumping from 0/8 to 8/8 after a minute of nothing.
   *
   * Each merge folds into the *current* draft, never the one captured when
   * generation started: a retried call can land long afterwards, and merging
   * into a stale snapshot silently drops everything saved meanwhile.
   */
  const runActionGeneration = useCallback(
    async (started: EditorDraft, ticketId: string, only?: number[]) => {
      setBusy(true)
      const contents = started.subgoals.map((s) => s.content)
      const targets =
        only ?? started.subgoals.map((_, index) => index)
      const failed: number[] = []

      await Promise.all(
        targets.map(async (index) => {
          const subgoal = started.subgoals[index]
          if (!subgoal) return
          const siblings = contents.filter((_, i) => i !== index)
          const result = await settled(
            generateActionsForSubgoal(
              subgoal.content,
              started.mainGoal,
              siblings,
              started.language,
              ticketId,
            ),
          )

          if (!result.ok) {
            failed.push(index)
            return
          }
          setDraft((latest) =>
            latest ? saveDraft(withActions(latest, subgoal.id, result.data)) : latest,
          )
        }),
      )

      setFailures(failed)
      setDraft((latest) => (latest ? saveDraft({ ...latest, step: "review-actions" }) : latest))
      setBusy(false)
    },
    [],
  )

  const handleGenerateActions = useCallback(() => {
    if (!draft) return
    const started = saveDraft({ ...draft, step: "generating-actions" })
    setDraft(started)
    setFailures([])
    const id = newTicket()
    setTicket(id)
    void runActionGeneration(started, id)
  }, [draft, runActionGeneration])

  /** Redoes only the areas that failed, never the ones already written. */
  const handleRetryFailed = useCallback(() => {
    if (!draft || failures.length === 0) return
    const retrying = [...failures]
    const started = saveDraft({ ...draft, step: "generating-actions" })
    setDraft(started)
    const id = newTicket()
    setTicket(id)
    void runActionGeneration(started, id, retrying)
  }, [draft, failures, runActionGeneration])

  /** Same shape as action generation: per area, merged as each one lands. */
  /**
   * Regenerates a single area, in place.
   *
   * Offered from the area itself rather than from the failure banner, because
   * the banner is component state and is gone after a reload — which used to
   * leave an empty area with no way forward at all.
   */
  const handleRegenerateArea = useCallback(
    async (subgoalIndex: number) => {
      if (!draft) return
      const subgoal = draft.subgoals[subgoalIndex]
      if (!subgoal) return

      setRegeneratingArea(subgoalIndex)
      setAreaError(null)
      setBusy(true)
      try {
        const siblings = draft.subgoals
          .filter((_, i) => i !== subgoalIndex)
          .map((s) => s.content)
        const result = await settled(
          generateActionsForSubgoal(
            subgoal.content,
            draft.mainGoal,
            siblings,
            draft.language,
            newTicket(),
          ),
        )
        if (result.ok) {
          setDraft((latest) =>
            latest ? saveDraft(withActions(latest, subgoal.id, result.data)) : latest,
          )
          setFailures((current) => current.filter((i) => i !== subgoalIndex))
        } else {
          // Silence here read as a dead button: it spun, then nothing changed
          // and nothing said why. The existing actions are left untouched.
          setAreaError(result.error)
        }
      } finally {
        setRegeneratingArea(null)
        setBusy(false)
      }
    },
    [draft],
  )

  const runOrderAnalysis = useCallback(async (current: EditorDraft, ticketId: string) => {
    setBusy(true)
    await Promise.all(
      current.subgoals.map(async (subgoal) => {
        const actions = (current.actions[subgoal.id] ?? []).map((a) => ({
          id: a.id,
          content: a.content,
        }))
        if (actions.length === 0) {
          setAnalyzed((done) => new Set(done).add(subgoal.id))
          return
        }

        const result = await settled(
          analyzeDependencies(
            actions,
            subgoal.content,
            current.mainGoal,
            current.id,
            current.language,
            ticketId,
          ),
        )

        setAnalyzed((done) => new Set(done).add(subgoal.id))
        if (!result.ok) return
        setDraft((latest) =>
          latest
            ? saveDraft(withDependencies(latest, [...latest.dependencies, ...result.data]))
            : latest,
        )
      }),
    )

    setDraft((latest) => (latest ? saveDraft({ ...latest, step: "visualization" }) : latest))
    setBusy(false)
  }, [])

  /**
   * Rewrites the plan's text in the interface language.
   *
   * Applied to the draft as it stands when the response lands, not to the one
   * captured when the request went out; if the plan changed shape meanwhile the
   * length check fails and nothing is written, which is the safe outcome.
   */
  const handleTranslateContent = useCallback(async () => {
    if (!draft) return
    setTranslating(true)
    setTranslateError(null)
    setBusy(true)
    try {
      const result = await settled(
        translatePlanText(draftToStrings(draft), uiLanguage, newTicket()),
      )
      if (!result.ok) {
        setTranslateError(result.error)
        return
      }
      let applied = false
      setDraft((latest) => {
        if (!latest) return latest
        const out = applyTranslations(latest, result.data, uiLanguage)
        if (!out.ok) return latest
        applied = true
        return saveDraft(out.draft)
      })
      if (!applied) setTranslateError("ai.error.malformed")
    } finally {
      setTranslating(false)
      setBusy(false)
    }
  }, [draft, uiLanguage])

  const handleFinishReview = useCallback(() => {
    if (!draft) return
    const started = saveDraft({ ...draft, step: "analyzing-order" })
    setDraft(started)
    setAnalyzed(new Set())
    const id = newTicket()
    setTicket(id)
    void runOrderAnalysis(started, id)
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

  const goTo = (step: AppStep) => update((d) => ({ ...d, step }))

  const screen = () => {
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
            update((d) => {
              // The button is disabled for a blank box; this is the backstop
              // for Enter, autofill and anything else that gets here anyway.
              const content = normalizeContent(d.subgoals[i]?.content ?? "")
              if (!content) return d
              return patchSubgoal(d, i, { content, isEditing: false, isConfirmed: true })
            })
          }
          onAcceptAll={() => update(confirmAllSubgoals)}
          onAllConfirmed={handleGenerateActions}
        />
      )
    }

    if (draft.step === "analyzing-order") {
      return <AnalyzingOrder subgoals={draft.subgoals} done={analyzed} ticketId={ticket} />
    }

    if (draft.step === "generating-actions") {
      return (
        <GeneratingActions
          subgoals={draft.subgoals}
          actions={draft.actions}
          ticketId={ticket}
        />
      )
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
            update((d) => {
              const current = d.actions[id]?.[i]
              if (!current) return d
              // Both fields, not just the text: a measure typed with stray
              // spaces was stored with them, and one that is only spaces has
              // to become null rather than a string that looks like a value.
              const clean = normalizeCell(current)
              if (!clean.content) return d
              return patchAction(d, id, i, {
                content: clean.content,
                metric: clean.metric,
                isEditing: false,
                isConfirmed: true,
              })
            })
          }
          onAcceptAllActions={(id) => update((d) => confirmAllActions(d, id))}
          onComplete={handleFinishReview}
          onRetrySubgoal={handleRetryFailed}
          onAddAction={(id) => update((d) => addAction(d, id))}
          onMetricUpdate={(id, i, metric) =>
            update((d) => patchAction(d, id, i, { metric: metric || null }))
          }
          onRemoveAction={(id, i) => {
            // Capture before the removal, so undo can restore the metric,
            // the position and the prerequisite edges — not just the text.
            const removed = removalOf(draft, id, i)
            update((d) => removeAction(d, id, i))
            if (removed) setUndoable(removed)
          }}
          undoable={
            undoable
              ? {
                  content: undoable.cell.content,
                  area:
                    draft.subgoals.findIndex((s) => s.id === undoable.subgoalId) + 1,
                }
              : null
          }
          onUndoRemove={() => {
            if (!undoable) return
            update((d) => restoreAction(d, undoable))
            setUndoable(null)
          }}
          onDismissUndo={() => setUndoable(null)}
          onRegenerateArea={handleRegenerateArea}
          regeneratingArea={regeneratingArea}
          areaError={areaError ? t(areaError) : null}
          onDismissAreaError={() => setAreaError(null)}
        />
      )
    }

    return (
      <MandalartVisualization
        draft={draft}
        locked={session.configured && !session.signedIn}
        onBack={() => goTo("review-actions")}
        onRestart={() => router.push("/")}
        onUpdateMainGoal={(content) => update((d) => ({ ...d, mainGoal: content }))}
        onUpdateSubgoal={(i, content) => update((d) => patchSubgoal(d, i, { content }))}
        onUpdateAction={(id, i, content) => update((d) => patchAction(d, id, i, { content }))}
        onRemoveDependency={(actionId, dependsOnId) =>
          update((d) => removeDependency(d, actionId, dependsOnId))
        }
        onShowTeaser={() => setShowTeaser(true)}
      />
    )
  }

  const languageMismatch =
    draft.language !== uiLanguage && keptLanguage !== uiLanguage

  return (
    <>
      {showTeaser && <TeaserSession draft={draft} onClose={() => setShowTeaser(false)} />}
      <StepProgress current={draft.step} onNavigate={goTo} busy={busy} />
      {languageMismatch && (
        <div className="px-4 pt-4">
          <LanguageChangePrompt
            source={draft.language}
            target={uiLanguage}
            busy={translating}
            error={translateError ? t(translateError) : null}
            onTranslate={handleTranslateContent}
            onKeep={() => setKeptLanguage(uiLanguage)}
          />
        </div>
      )}
      {screen()}
    </>
  )
}
