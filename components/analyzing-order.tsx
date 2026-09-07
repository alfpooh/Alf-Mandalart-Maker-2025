"use client"

import { Check, Loader2 } from "lucide-react"

import { useLanguage } from "@/lib/language-context"
import { QueueNotice } from "@/components/queue-notice"
import type { EditorCell } from "@/lib/types"

/**
 * The wait while prerequisites are worked out, one area at a time.
 *
 * Eight parallel calls, shown as they land — the same shape as action
 * generation, so the two steps feel like one process rather than two stalls.
 */
export function AnalyzingOrder({
  subgoals,
  done,
  ticketId = null,
}: {
  subgoals: EditorCell[]
  done: Set<string>
  ticketId?: string | null
}) {
  const { t } = useLanguage()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="mx-auto max-w-3xl pt-16">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-2xl font-bold text-gray-800">{t("order.analyzing")}</h1>
          <p className="text-gray-600" aria-live="polite">
            {done.size} / {subgoals.length} {t("generating.progress")}
          </p>
        </div>

        {ticketId && (
          <div className="mb-6">
            <QueueNotice ticketId={ticketId} />
          </div>
        )}

        <ul className="space-y-2">
          {subgoals.map((subgoal) => {
            const finished = done.has(subgoal.id)
            return (
              <li
                key={subgoal.id}
                className={`flex items-center gap-3 rounded-lg border bg-white p-4 transition-colors ${
                  finished ? "border-green-300" : "border-gray-200"
                }`}
              >
                <span className="flex-none">
                  {finished ? (
                    <Check className="h-5 w-5 text-green-600" aria-hidden="true" />
                  ) : (
                    <Loader2
                      className="h-5 w-5 animate-spin text-gray-400 motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="flex-1 text-gray-800">{subgoal.content}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
