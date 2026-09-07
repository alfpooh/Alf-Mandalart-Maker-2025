"use client"

import { Check, Loader2 } from "lucide-react"

import { useLanguage } from "@/lib/language-context"
import { ACTIONS_PER_SUBGOAL, type EditorCell } from "@/lib/types"

interface GeneratingActionsProps {
  subgoals: EditorCell[]
  actions: Record<string, EditorCell[]>
}

/**
 * The wait while eight areas are filled in.
 *
 * The eight calls now run together rather than in series, and this shows each
 * area landing as it arrives — a spinner over a blank screen gave no sense of
 * whether anything was happening or how much was left.
 */
export function GeneratingActions({ subgoals, actions }: GeneratingActionsProps) {
  const { t } = useLanguage()
  const done = subgoals.filter((s) => (actions[s.id]?.length ?? 0) > 0).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="mx-auto max-w-3xl pt-16">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-2xl font-bold text-gray-800">
            {t("generating.title")}
          </h1>
          <p className="text-gray-600" aria-live="polite">
            {done} / {subgoals.length} {t("generating.progress")}
          </p>
        </div>

        <ul className="space-y-2">
          {subgoals.map((subgoal) => {
            const filled = (actions[subgoal.id]?.length ?? 0) > 0
            return (
              <li
                key={subgoal.id}
                className={`flex items-center gap-3 rounded-lg border bg-white p-4 transition-colors ${
                  filled ? "border-green-300" : "border-gray-200"
                }`}
              >
                <span className="flex-none">
                  {filled ? (
                    <Check className="h-5 w-5 text-green-600" aria-hidden="true" />
                  ) : (
                    <Loader2
                      className="h-5 w-5 animate-spin text-gray-400 motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  )}
                </span>

                <span className="flex-1 text-gray-800">{subgoal.content}</span>

                <span className="flex-none text-sm tabular-nums text-gray-500">
                  {filled ? `${ACTIONS_PER_SUBGOAL}` : "—"}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
