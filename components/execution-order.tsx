"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Lock, Play, Unlink } from "lucide-react"

import { computeReadiness, type ReadinessEntry } from "@/lib/graph"
import { useLanguage } from "@/lib/language-context"
import { areaOfAction, draftToActions, type EditorDraft } from "@/lib/types"

interface ExecutionOrderProps {
  draft: EditorDraft
  /** How many startable actions to show before the rest collapse. */
  highlightCount?: number
  onRemoveDependency?: (actionId: string, dependsOnId: string) => void
}

/**
 * What can be started now, and what is waiting on what.
 *
 * Showing 64 actions at once is why Mandalarts get made and never begun. This
 * names the handful with nothing in front of them, which is the only list a
 * person can act on today.
 *
 * The ordering is a suggestion, never a gate: a blocked action still says what
 * it is waiting for, and any prerequisite can be dropped. One wrong edge must
 * not be able to lock a plan.
 */
export function ExecutionOrder({
  draft,
  highlightCount = 3,
  onRemoveDependency,
}: ExecutionOrderProps) {
  const { t } = useLanguage()
  const [showAllReady, setShowAllReady] = useState(false)
  const [showBlocked, setShowBlocked] = useState(false)

  const { ready, blocked } = useMemo(
    () => computeReadiness(draftToActions(draft), draft.dependencies),
    [draft],
  )

  if (ready.length === 0 && blocked.length === 0) return null

  const shown = showAllReady ? ready : ready.slice(0, highlightCount)

  return (
    <section className="rounded-lg border border-border bg-white p-5">
      <h2 className="text-lg font-bold text-gray-900">
        {t("order.readyTitle").replace("{n}", String(ready.length))}
      </h2>
      <p className="mt-1 text-sm text-gray-600">{t("order.readyHint")}</p>

      <ul className="mt-4 space-y-2">
        {shown.map((entry) => (
          <li
            key={entry.action.id}
            className="flex items-start gap-3 rounded-md border border-border p-3"
          >
            <span
              aria-hidden="true"
              className="mt-1 h-3 w-3 flex-none rounded-sm"
              style={{ background: areaColor(draft, entry.action.id) }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{entry.action.content}</p>
              {entry.action.metric && (
                <p className="mt-0.5 text-xs text-gray-500">
                  {t("detailedActions.metric")}: {entry.action.metric}
                </p>
              )}
            </div>
            <Play className="mt-1 h-4 w-4 flex-none text-green-600" aria-hidden="true" />
          </li>
        ))}
      </ul>

      {ready.length > highlightCount && (
        <button
          type="button"
          onClick={() => setShowAllReady((v) => !v)}
          className="mt-3 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-gray-700 hover:underline focus-visible:outline focus-visible:outline-2"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showAllReady ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          {showAllReady
            ? t("order.showFewer")
            : t("order.showAllReady").replace("{n}", String(ready.length))}
        </button>
      )}

      {blocked.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setShowBlocked((v) => !v)}
            aria-expanded={showBlocked}
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-gray-700 hover:underline focus-visible:outline focus-visible:outline-2"
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            {t("order.blockedTitle").replace("{n}", String(blocked.length))}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showBlocked ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>

          {showBlocked && (
            <ul className="mt-3 space-y-2">
              {blocked.map((entry) => (
                <BlockedRow
                  key={entry.action.id}
                  draft={draft}
                  entry={entry}
                  onRemoveDependency={onRemoveDependency}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function BlockedRow({
  draft,
  entry,
  onRemoveDependency,
}: {
  draft: EditorDraft
  entry: ReadinessEntry
  onRemoveDependency?: (actionId: string, dependsOnId: string) => void
}) {
  const { t } = useLanguage()

  return (
    <li className="rounded-md border border-border bg-gray-50 p-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1 h-3 w-3 flex-none rounded-sm opacity-50"
          style={{ background: areaColor(draft, entry.action.id) }}
        />
        <p className="min-w-0 flex-1 text-sm text-gray-700">{entry.action.content}</p>
      </div>

      <ul className="mt-2 space-y-1 pl-6">
        {entry.blockedBy.map((prerequisite) => (
          <li key={prerequisite.id} className="flex items-start gap-2 text-xs text-gray-600">
            <span className="flex-none">{t("order.waitsFor")}</span>
            <span className="min-w-0 flex-1 font-medium">{prerequisite.content}</span>
            {onRemoveDependency && (
              <button
                type="button"
                onClick={() => onRemoveDependency(entry.action.id, prerequisite.id)}
                className="flex-none rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-900 focus-visible:outline focus-visible:outline-2"
                aria-label={`${t("order.unlink")}: ${prerequisite.content}`}
                title={t("order.unlink")}
              >
                <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </li>
  )
}

function areaColor(draft: EditorDraft, actionId: string): string {
  const area = areaOfAction(draft, actionId)
  return area ? `var(--area-${area})` : "var(--area-center)"
}
