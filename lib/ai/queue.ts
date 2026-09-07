/**
 * A single queue in front of every model call.
 *
 * Bounding concurrency inside one person's batch was not enough: two visitors
 * generating at the same time each opened their own calls, and together they
 * exceeded the provider's per-minute token allowance, so both got failures.
 * The limit is shared, so the queue has to be shared too.
 *
 * Waiters are served first-come, first-served, and each is given a ticket so
 * the UI can tell someone how many people are ahead of them rather than
 * showing a spinner that looks stuck.
 *
 * Scope: this lives in the Node process. It serialises correctly for a single
 * server — `next start`, a container, one warm serverless instance. It does
 * not coordinate across separate instances, so a deployment that scales out
 * needs a shared backend (the `plans` database would do) before this holds.
 * Until then it turns the common case, a handful of people on one instance,
 * from failing into queueing.
 */

/** How many model calls may run at once, across everyone. */
const MAX_CONCURRENT = Math.max(1, Number(process.env.AI_CONCURRENCY ?? "2"))

/**
 * A waiter is dropped from the queue if it never gets a slot in this long.
 * Without it, a caller that vanished mid-request would hold a place forever.
 */
const MAX_WAIT_MS = 5 * 60 * 1000

interface Waiter {
  ticketId: string
  enqueuedAt: number
  release: () => void
}

/**
 * State lives on `globalThis`, not in module scope.
 *
 * Next.js compiles server actions and route handlers into separate webpack
 * layers, so a module-level array gives each its own copy: the queue would cap
 * per layer instead of overall, and the status endpoint would report an empty
 * queue while generation was in full flow. A global also survives hot reloads
 * in development, which module scope does not.
 *
 * `running` holds one entry per in-flight call, not per ticket. A single run
 * makes eight calls under one ticket, so counting distinct tickets would see
 * "one thing running" and let the whole batch through, defeating the cap.
 */
interface QueueState {
  waiting: Waiter[]
  running: string[]
}

const GLOBAL_KEY = Symbol.for("mandalart.ai.queue")

function state(): QueueState {
  const host = globalThis as unknown as Record<symbol, QueueState | undefined>
  return (host[GLOBAL_KEY] ??= { waiting: [], running: [] })
}

export interface QueueStatus {
  /** Other runs ahead of this one. 0 when nothing is ahead, -1 if unknown. */
  position: number
  /** This run's own calls still queued. The signal for showing a wait. */
  mine: number
  /** Other runs sharing the queue right now. */
  others: number
  /** Total calls queued. */
  waiting: number
  /** Calls in flight. */
  running: number
}

/** Where a ticket stands. An unknown ticket reports -1, never a fake 0. */
export function queueStatus(ticketId?: string): QueueStatus {
  const { waiting, running } = state()
  const base = { waiting: waiting.length, running: running.length }
  if (!ticketId) return { position: -1, mine: 0, others: 0, ...base }

  const mine = waiting.filter((w) => w.ticketId === ticketId).length
  const others = new Set(
    [...waiting.map((w) => w.ticketId), ...running].filter((id) => id !== ticketId),
  ).size

  // Having a call in flight means nothing is ahead — but the rest of the batch
  // may still be queued, which is what `mine` reports.
  if (running.includes(ticketId)) {
    return { position: 0, mine, others, ...base }
  }

  // Count runs ahead, not calls: "3 people ahead" is meaningful, "17" is not.
  const index = waiting.findIndex((w) => w.ticketId === ticketId)
  if (index === -1) return { position: -1, mine, others, ...base }
  const ahead = new Set(waiting.slice(0, index).map((w) => w.ticketId))
  return { position: ahead.size, mine, others, ...base }
}

function pump(): void {
  const { waiting, running } = state()
  while (running.length < MAX_CONCURRENT && waiting.length > 0) {
    const next = waiting.shift()
    if (!next) return
    running.push(next.ticketId)
    next.release()
  }
}

/** Drops waiters that have been queued past the ceiling. */
function evictStale(): void {
  const { waiting, running } = state()
  const cutoff = Date.now() - MAX_WAIT_MS
  for (let i = waiting.length - 1; i >= 0; i--) {
    if (waiting[i].enqueuedAt < cutoff) {
      const [stale] = waiting.splice(i, 1)
      // Let it proceed rather than hang; it will fail on its own terms.
      running.push(stale.ticketId)
      stale.release()
    }
  }
}

/**
 * Runs `fn` once a slot is free, then hands the slot to whoever is next.
 *
 * The slot is released in a finally block: a call that throws must not take
 * the queue down with it.
 */
export async function withSlot<T>(ticketId: string, fn: () => Promise<T>): Promise<T> {
  const { waiting, running } = state()
  evictStale()

  if (running.length < MAX_CONCURRENT && waiting.length === 0) {
    running.push(ticketId)
  } else {
    // `pump` pushes the slot on this waiter's behalf before releasing it, so
    // the seat is never briefly free for someone else to take.
    await new Promise<void>((resolve) => {
      waiting.push({ ticketId, enqueuedAt: Date.now(), release: resolve })
    })
  }

  try {
    return await fn()
  } finally {
    const index = running.indexOf(ticketId)
    if (index !== -1) running.splice(index, 1)
    pump()
  }
}

/** Test seam: forgets all state. Never called by the app. */
export function resetQueue(): void {
  const s = state()
  s.waiting.length = 0
  s.running.length = 0
}

export const QUEUE_LIMIT = MAX_CONCURRENT
