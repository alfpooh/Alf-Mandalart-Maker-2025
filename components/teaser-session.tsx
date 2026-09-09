"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Download, Info, LogIn, Lock, X } from "lucide-react"

import { ExecutionOrder } from "@/components/execution-order"
import { MandalartGrid } from "@/components/mandalart-grid"
import { signInWithGoogle } from "@/lib/auth-actions"
import { track } from "@/lib/analytics"
import { readProgressFromText } from "@/lib/actions"
import { newTicket } from "@/lib/ticket"
import { useLanguage } from "@/lib/language-context"
import { settle } from "@/lib/settle"
import {
  draftActions,
  PROGRESS_STAGES,
  type EditorDraft,
  type ProgressValue,
} from "@/lib/types"

const STEPS = ["order", "tracking", "progress", "export", "signin"] as const
type Step = (typeof STEPS)[number]

/**
 * What an account unlocks, shown on the plan the person just wrote.
 *
 * This runs at the one moment their attention is highest — they have spent
 * real time on 64 cells and are attached to the result. A generic product tour
 * would waste that; every screen here renders their own goal.
 *
 * It is always closable, and closing costs nothing: the plan stays in the
 * browser for 24 hours either way. A wall would trade return visits for
 * sign-ups, which is the wrong trade this early.
 */
export function TeaserSession({
  draft,
  onClose,
}: {
  draft: EditorDraft
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [index, setIndex] = useState(0)
  const step = STEPS[index]
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    track("teaser_open", { plan: draft.id, actions: draftActions(draft).length })
  }, [draft])

  useEffect(() => {
    track("teaser_step", { step, index })
  }, [step, index])

  // Escape closes, and focus moves into the dialog so the keyboard works.
  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismiss = () => {
    track("teaser_dismiss", { step: STEPS[index], index })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="teaser-title"
        tabIndex={-1}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl"
      >
        <header className="flex items-start gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {index + 1} / {STEPS.length}
            </p>
            <h2 id="teaser-title" className="mt-0.5 truncate text-lg font-bold text-gray-900">
              {t(`teaser.${step}.title`)}
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("teaser.close")}
            className="-m-2 flex-none rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-4 text-sm text-gray-600">{t(`teaser.${step}.body`)}</p>
          {step === "order" && <OrderStep draft={draft} />}
          {step === "tracking" && <TrackingStep draft={draft} />}
          {step === "progress" && <ProgressStep draft={draft} />}
          {step === "export" && <ExportStep draft={draft} />}
          {step === "signin" && <SignInStep />}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border p-4">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-3 text-sm font-medium text-gray-700 disabled:invisible hover:bg-gray-100 focus-visible:outline focus-visible:outline-2"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {t("teaser.back")}
          </button>

          <button
            type="button"
            onClick={dismiss}
            className="min-h-[44px] px-2 text-sm text-gray-500 underline hover:text-gray-900 focus-visible:outline focus-visible:outline-2"
          >
            {t("teaser.later")}
          </button>

          {index < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setIndex((i) => i + 1)}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 focus-visible:outline focus-visible:outline-2"
            >
              {t("teaser.next")}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <span className="w-[68px]" aria-hidden="true" />
          )}
        </footer>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Their real dependency analysis — the strongest thing to lead with. */
function OrderStep({ draft }: { draft: EditorDraft }) {
  return <ExecutionOrder draft={draft} highlightCount={3} />
}

/**
 * Their own grid carrying progress.
 *
 * The figures are illustrative and say so on the card. Unlabelled sample data
 * turns into "why did my plan change?" the moment someone signs in.
 */
function TrackingStep({ draft }: { draft: EditorDraft }) {
  const { t } = useLanguage()

  const demo = useMemo(() => {
    const map: Record<string, ProgressValue> = {}
    // Deterministic from position, so the picture is stable across renders and
    // reads as a worked example rather than something random.
    draftActions(draft).forEach((action, index) => {
      if (index % 3 === 0) map[action.id] = PROGRESS_STAGES[index % PROGRESS_STAGES.length]
    })
    return map
  }, [draft])

  return (
    <div>
      <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3">
        <Info className="mt-0.5 h-4 w-4 flex-none text-amber-700" aria-hidden="true" />
        <p className="text-xs text-amber-900">{t("teaser.tracking.sampleNotice")}</p>
      </div>
      <MandalartGrid draft={draft} progress={demo} />
    </div>
  )
}

/**
 * The free-text conversion, run for real on one of their own actions.
 *
 * Behind a button rather than automatic: it costs a model call, and a demo the
 * person triggers themselves lands better than one that has already happened.
 */
function ProgressStep({ draft }: { draft: EditorDraft }) {
  const { t } = useLanguage()
  const action = draftActions(draft)[0]

  const [note, setNote] = useState(t("teaser.progress.example"))
  const [result, setResult] = useState<{ progress: ProgressValue; rationale: string } | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!action) return null

  const run = async () => {
    setBusy(true)
    setError(null)
    const outcome = settle(
      await readProgressFromText(
        note,
        { content: action.content, metric: action.metric, current: 0 },
        draft.language,
        newTicket(),
      ),
    )
    if (outcome.ok) setResult(outcome.data)
    else setError(outcome.error)
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border p-3">
        <p className="text-xs uppercase tracking-wide text-gray-500">
          {t("detailedActions.action")}
        </p>
        <p className="mt-1 text-sm font-medium text-gray-900">{action.content}</p>
      </div>

      <label className="block text-sm font-medium text-gray-700" htmlFor="teaser-note">
        {t("teaser.progress.label")}
      </label>
      <textarea
        id="teaser-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        className="w-full rounded-md border border-border p-2 text-sm focus-visible:outline focus-visible:outline-2"
      />

      <button
        type="button"
        onClick={run}
        disabled={busy || note.trim().length === 0}
        className="min-h-[44px] rounded-md bg-gray-900 px-4 text-sm font-semibold text-white disabled:opacity-50 hover:bg-gray-800 focus-visible:outline focus-visible:outline-2"
      >
        {busy ? t("teaser.progress.converting") : t("teaser.progress.convert")}
      </button>

      {result && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3">
          <p className="text-2xl font-bold tabular-nums text-green-900">{result.progress}%</p>
          <p className="mt-1 text-sm text-green-900">{result.rationale}</p>
          <p className="mt-2 text-xs text-green-800">{t("teaser.progress.youDecide")}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {t(error)}
        </p>
      )}
    </div>
  )
}

/** Their finished grid, with the download locked rather than mocked. */
function ExportStep({ draft }: { draft: EditorDraft }) {
  const { t } = useLanguage()
  return (
    <div>
      <div className="pointer-events-none overflow-hidden rounded-md border border-border p-2">
        <MandalartGrid draft={draft} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-[44px] cursor-not-allowed items-center gap-2 rounded-md border border-border bg-gray-100 px-4 text-sm font-medium text-gray-500">
          <Lock className="h-4 w-4" aria-hidden="true" />
          <Download className="h-4 w-4" aria-hidden="true" />
          {t("teaser.export.locked")}
        </span>
      </div>
    </div>
  )
}

function SignInStep() {
  const { t } = useLanguage()
  return (
    <form action={signInWithGoogle} className="space-y-4">
      <ul className="space-y-2 text-sm text-gray-700">
        {["keep", "order", "track", "export"].map((key) => (
          <li key={key} className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-gray-900" />
            {t(`teaser.signin.benefit.${key}`)}
          </li>
        ))}
      </ul>
      <button
        type="submit"
        onClick={() => track("teaser_signin_click")}
        className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-6 text-sm font-semibold text-white hover:bg-gray-800 focus-visible:outline focus-visible:outline-2"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        {t("auth.signIn")}
      </button>
      <p className="text-center text-xs text-gray-500">{t("teaser.signin.reassure")}</p>
    </form>
  )
}
