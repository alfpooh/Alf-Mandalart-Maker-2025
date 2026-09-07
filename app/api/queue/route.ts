import { NextResponse } from "next/server"

import { queueStatus } from "@/lib/ai/queue"

/**
 * Queue position for a ticket.
 *
 * A route handler rather than a server action on purpose: Next.js serialises
 * server actions per client, so a status action would sit behind the very
 * generation calls it is meant to describe and only answer once they had
 * finished. A plain GET goes straight through.
 */
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  const ticketId = new URL(request.url).searchParams.get("ticket") ?? undefined
  return NextResponse.json(queueStatus(ticketId), {
    headers: { "cache-control": "no-store" },
  })
}
