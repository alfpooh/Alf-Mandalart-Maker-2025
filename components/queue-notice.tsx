"use client"

import { useEffect, useState } from "react"
import { Users } from "lucide-react"

import { useLanguage } from "@/lib/language-context"

/**
 * Where this run stands in the shared queue.
 *
 * Generation can sit for a while when other people are ahead, and an
 * unexplained wait reads as a hang. Polling is fine here: it is one small
 * request every couple of seconds, only while something is actually waiting.
 *
 * It hits a route handler rather than a server action — Next.js serialises
 * server actions per client, so a status action would queue behind the
 * generation calls and answer only after they had all finished.
 */
export function QueueNotice({ ticketId }: { ticketId: string | null }) {
  const { t } = useLanguage()
  const [status, setStatus] = useState<{ position: number; mine: number; others: number }>({
    position: 0,
    mine: 0,
    others: 0,
  })

  useEffect(() => {
    if (!ticketId) return
    let cancelled = false

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/queue?ticket=${encodeURIComponent(ticketId)}`,
          { cache: "no-store" },
        )
        if (!response.ok) return
        const next = (await response.json()) as typeof status
        if (!cancelled) setStatus(next)
      } catch {
        // A failed poll says nothing about the work itself; keep the last value.
      }
    }

    void poll()
    const timer = setInterval(poll, 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [ticketId])

  // Nothing of this run is queued — there is no wait to explain.
  if (status.mine <= 0) return null

  // Someone else is genuinely ahead, versus this run simply taking its turns.
  const headline =
    status.position > 0
      ? t("queue.ahead").replace("{n}", String(status.position))
      : t("queue.turns").replace("{n}", String(status.mine))

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex max-w-md items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-left"
    >
      <Users className="mt-0.5 h-4 w-4 flex-none text-amber-700" aria-hidden="true" />
      <div className="text-sm text-amber-900">
        <p className="font-medium">{headline}</p>
        <p className="mt-0.5 text-xs text-amber-800">
          {status.others > 0 ? t("queue.shared") : t("queue.why")}
        </p>
      </div>
    </div>
  )
}
