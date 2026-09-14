"use client"

import { AlertTriangle, Check, CloudOff, Loader2 } from "lucide-react"
import type { ReactNode } from "react"

import { useLanguage } from "@/lib/language-context"
import type { SyncStatus } from "@/lib/use-plan-sync"

/**
 * Whether the plan has reached the account.
 *
 * Saving to the account happens in the background, and a failure nobody can
 * see is how work goes missing: the copy in this browser is safe, but the
 * person may assume their other device has it. Quiet when there is nothing
 * to report.
 */
export function SyncIndicator({ status }: { status: SyncStatus }) {
  const { t } = useLanguage()
  const view = describe(status, t)
  if (!view) return null

  return (
    <p
      role="status"
      aria-live="polite"
      className={`mx-auto flex max-w-6xl items-center justify-end gap-1.5 px-4 pt-2 text-xs ${view.tone}`}
    >
      {view.icon}
      <span>{view.text}</span>
    </p>
  )
}

function describe(
  status: SyncStatus,
  t: (key: string) => string,
): { icon: ReactNode; text: string; tone: string } | null {
  switch (status.state) {
    case "off":
    case "idle":
      return null
    case "saving":
      return {
        icon: (
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ),
        text: t("sync.saving"),
        tone: "text-gray-500",
      }
    case "saved":
      return {
        icon: <Check className="h-3.5 w-3.5" aria-hidden="true" />,
        text: t("sync.saved"),
        tone: "text-green-700",
      }
    case "waiting":
      return {
        icon: <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />,
        text: t(
          status.reason === "too-long"
            ? "sync.tooLong"
            : status.reason === "blank-subgoal" || status.reason === "blank-main-goal"
              ? "sync.waitingBlank"
              : "sync.localOnly",
        ),
        tone: "text-amber-700",
      }
    case "error":
      return {
        icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
        text: t(status.error),
        tone: "text-red-700",
      }
  }
}
