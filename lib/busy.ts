/**
 * Whether a generation run is in progress.
 *
 * The header sits outside the plan screen but needs to know, because leaving
 * mid-run abandons work that has already been paid for — a plan's calls are
 * most of a day's anonymous quota. A module-level flag with subscribers is
 * enough here; this is one boolean shared by two components, not app state.
 */

let busy = false
const listeners = new Set<(value: boolean) => void>()

export function setBusy(value: boolean): void {
  if (busy === value) return
  busy = value
  for (const listener of listeners) listener(value)
}

export function isBusy(): boolean {
  return busy
}

/** Subscribes to changes. Returns the unsubscribe function. */
export function subscribeBusy(listener: (value: boolean) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
