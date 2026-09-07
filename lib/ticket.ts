/**
 * A per-run identifier for the shared model-call queue.
 *
 * Minted on the client so the position can be polled while the generation
 * request is still open — a server action cannot both block on the queue and
 * hand back a ticket to ask about it.
 */
export function newTicket(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}
