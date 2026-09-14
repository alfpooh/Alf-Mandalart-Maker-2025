"use client"

import Link from "next/link"
import { Pin, Settings2 } from "lucide-react"

import { describeDay } from "@/components/dashboard/describe-day"
import { useLanguage } from "@/lib/language-context"
import type { DisplayStatus, PlanSummary } from "@/lib/plan-summary"
import { TOTAL_ACTIONS } from "@/lib/types"

/** Colour backs up the words on the badge; it never carries the status alone. */
const STATUS_STYLE: Record<DisplayStatus, string> = {
  writing: "border-amber-300 bg-amber-50 text-amber-900",
  active: "border-sky-300 bg-sky-50 text-sky-900",
  completed: "border-emerald-300 bg-emerald-50 text-emerald-900",
  archived: "border-gray-300 bg-gray-100 text-gray-700",
}

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"

interface PlanCardProps {
  plan: PlanSummary
  selected: boolean
  onSelect: (selected: boolean) => void
  onTogglePin: () => void
  onManage: () => void
}

/**
 * One Mandalart on the dashboard.
 *
 * While a plan is still being written, the bar and the eight area marks show
 * how much is written; after that they show progress. A plan the account holds
 * no content for says so, instead of showing a row of empty bars that reads
 * as "nothing done".
 */
export function PlanCard({ plan, selected, onSelect, onTogglePin, onManage }: PlanCardProps) {
  const { t, language } = useLanguage()
  const empty = plan.subgoalCount === 0
  const meter = plan.drafting ? Math.round((plan.filled / TOTAL_ACTIONS) * 100) : plan.progress
  const areaKey = plan.drafting ? "dashboard.card.areaWritten" : "dashboard.card.area"

  return (
    <li
      className={`flex flex-col rounded-lg border bg-white p-4 shadow-sm ${
        selected ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
          aria-label={t("dashboard.card.select", { goal: plan.mainGoal })}
          className={`mt-1 h-4 w-4 flex-none accent-gray-900 ${FOCUS}`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[plan.status]}`}
            >
              {t(`dashboard.status.${plan.status}`)}
            </span>
            <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-600">
              <span aria-hidden="true">{plan.language}</span>
              <span className="sr-only">{t(`language.name.${plan.language}`)}</span>
            </span>
          </div>

          <h2 className="mt-2 text-base font-semibold leading-snug text-gray-900">
            <Link
              href={`/plan/${plan.id}`}
              className={`line-clamp-2 break-words rounded-sm hover:underline ${FOCUS}`}
            >
              {plan.mainGoal}
            </Link>
          </h2>
        </div>

        <button
          type="button"
          onClick={onTogglePin}
          aria-pressed={plan.pinned}
          aria-label={t(plan.pinned ? "dashboard.card.unpin" : "dashboard.card.pin", {
            goal: plan.mainGoal,
          })}
          className={`-mr-1 -mt-1 flex h-9 w-9 flex-none items-center justify-center rounded-md hover:bg-gray-100 ${FOCUS} ${
            plan.pinned ? "text-gray-900" : "text-gray-400 hover:text-gray-700"
          }`}
        >
          <Pin className={`h-4 w-4 ${plan.pinned ? "fill-current" : ""}`} aria-hidden="true" />
        </button>
      </div>

      {empty ? (
        <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
          {t("dashboard.card.noContent")}
        </p>
      ) : (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="tabular-nums text-gray-700">
              {plan.drafting
                ? t("dashboard.card.written", { filled: plan.filled, total: TOTAL_ACTIONS })
                : t("dashboard.card.done", { done: plan.done, total: TOTAL_ACTIONS })}
            </span>
            {!plan.drafting && (
              <span className="font-semibold tabular-nums text-gray-900">
                {t("dashboard.card.progress", { pct: plan.progress })}
              </span>
            )}
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
            <div className="h-full rounded-full bg-gray-900" style={{ width: `${meter}%` }} />
          </div>

          <ol
            aria-label={t(plan.drafting ? "dashboard.card.areasWritten" : "dashboard.card.areas")}
            className="mt-3 grid grid-cols-8 gap-1"
          >
            {plan.areas.map((value, index) => {
              const label = t(areaKey, { n: index + 1, pct: value })
              return (
                <li key={index} title={label}>
                  <span className="sr-only">{label}</span>
                  <span
                    className="block h-1.5 overflow-hidden rounded-full"
                    style={{ background: `var(--area-${index + 1}-soft)` }}
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full"
                      style={{ width: `${value}%`, background: `var(--area-${index + 1})` }}
                    />
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <p className="min-w-0 text-xs leading-relaxed text-gray-600">
          <span className="block" suppressHydrationWarning>
            {t("dashboard.card.lastActivity", { date: describeDay(plan.lastActivityAt, language) })}
          </span>
          <span className="block" suppressHydrationWarning>
            {t("dashboard.card.created", { date: describeDay(plan.createdAt, language) })}
          </span>
        </p>
        <button
          type="button"
          onClick={onManage}
          aria-label={t("dashboard.card.manage", { goal: plan.mainGoal })}
          className={`inline-flex min-h-[40px] flex-none items-center gap-1.5 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-800 hover:bg-gray-50 ${FOCUS}`}
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          {t("dashboard.card.manageShort")}
        </button>
      </div>
    </li>
  )
}
