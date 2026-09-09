"use client"

import { Check } from "lucide-react"

import { useLanguage } from "@/lib/language-context"
import type { AppStep } from "@/lib/types"

/**
 * The four stages of building a Mandalart, and where this one is.
 *
 * The five screens used to replace each other with nothing in common, so there
 * was no sense of "two of four" and no way back to a decision already made.
 *
 * Completed stages are links backwards. Forward is deliberately not offered:
 * each stage ends with its own action — confirm the areas, finish the review —
 * and a shortcut past that would skip the work the stage exists for.
 */

/** Stage index for each step. The two waiting screens sit on the stage they
 *  are producing, so the bar does not jump backwards mid-run. */
const STAGE_OF: Record<AppStep, number> = {
  "review-subgoals": 1,
  "generating-actions": 2,
  "review-actions": 2,
  "analyzing-order": 3,
  visualization: 3,
}

/** Which step a stage returns to, for the ones that can be revisited. */
const STEP_OF_STAGE: Record<number, AppStep | null> = {
  0: null, // the goal itself is edited on the final screen, not re-entered
  1: "review-subgoals",
  2: "review-actions",
  3: "visualization",
}

const LABELS = ["goal", "subgoals", "actions", "done"] as const

interface StepProgressProps {
  current: AppStep
  /** Omitted while a run is in flight, which disables going back. */
  onNavigate?: (step: AppStep) => void
  busy?: boolean
}

export function StepProgress({ current, onNavigate, busy = false }: StepProgressProps) {
  const { t } = useLanguage()
  const stage = STAGE_OF[current]

  return (
    <nav aria-label={t("steps.label")} className="border-b border-border bg-background">
      <ol className="mx-auto flex max-w-3xl items-center gap-1 px-4 py-2 sm:gap-2">
        {LABELS.map((label, index) => {
          const done = index < stage
          const active = index === stage
          const target = STEP_OF_STAGE[index]
          const canReturn = done && target !== null && !busy && onNavigate !== undefined

          const content = (
            <>
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                  done
                    ? "bg-foreground text-background"
                    : active
                      ? "border-2 border-foreground text-foreground"
                      : "border border-border text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={`truncate text-xs sm:text-sm ${
                  active ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                {t(`steps.${label}`)}
              </span>
            </>
          )

          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
              {canReturn ? (
                <button
                  type="button"
                  onClick={() => onNavigate(target)}
                  className="flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-md px-1 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:gap-2"
                  aria-label={`${t("steps.backTo")}: ${t(`steps.${label}`)}`}
                >
                  {content}
                </button>
              ) : (
                <span
                  className="flex min-h-[44px] min-w-0 items-center gap-1.5 px-1 sm:gap-2"
                  aria-current={active ? "step" : undefined}
                >
                  {content}
                </span>
              )}

              {index < LABELS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`h-px min-w-2 flex-1 ${done ? "bg-foreground" : "bg-border"}`}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
