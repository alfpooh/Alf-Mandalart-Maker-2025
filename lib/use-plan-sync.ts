/**
 * Keeps a signed-in user's plan saved to their account while they work.
 *
 * Every edit is already written to the browser by `saveDraft`, which marks the
 * copy as unsaved. This sends the latest copy to the account once typing
 * pauses, and clears the mark only when the server confirms — so a failed
 * save leaves the change marked, and it is sent again on the next edit, on the
 * next step, or when the tab is hidden.
 */

import { useCallback, useEffect, useRef, useState } from "react"

import { isUuid, type PayloadProblem } from "./plan-sync"
import { savePlan } from "./plans"
import { settled } from "./settle"
import { markSynced } from "./store/local-drafts"
import type { EditorDraft } from "./types"

export type SyncStatus =
  /** Not signed in, or a draft that lives only in this browser. */
  | { state: "off" }
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved" }
  /** Cannot be saved as it stands — e.g. a box emptied mid-edit. Not an error. */
  | { state: "waiting"; reason: PayloadProblem }
  /** A translation key. */
  | { state: "error"; error: string }

/** Long enough that typing a sentence is one save, short enough to rarely lose one. */
const DEBOUNCE_MS = 1200

export function usePlanSync(
  draft: EditorDraft | null,
  enabled: boolean,
): { status: SyncStatus; flush: () => Promise<void> } {
  const active = enabled && draft !== null && isUuid(draft.id)
  const [status, setStatus] = useState<SyncStatus>({ state: active ? "idle" : "off" })

  // Read at send time, not captured when the timer was set: the copy sent must
  // be the newest one, not whichever was current a second ago.
  const latest = useRef(draft)
  latest.current = draft
  const inFlight = useRef(false)
  const again = useRef(false)

  const push = useCallback(async (): Promise<void> => {
    const current = latest.current
    if (!current || current.pendingSync !== true || !isUuid(current.id)) return

    // One save at a time. Anything that changes meanwhile is sent right after,
    // rather than racing the first save to the database.
    if (inFlight.current) {
      again.current = true
      return
    }
    inFlight.current = true
    const sentUpdatedAt = current.updatedAt
    setStatus({ state: "saving" })

    try {
      const result = await settled(savePlan(current))
      if (result.ok) {
        markSynced(current.id, sentUpdatedAt, result.savedAt)
        setStatus({ state: "saved" })
      } else if ("reason" in result && result.reason) {
        setStatus({ state: "waiting", reason: result.reason })
      } else {
        setStatus({ state: "error", error: result.error })
      }
    } finally {
      inFlight.current = false
      if (again.current) {
        again.current = false
        void push()
      }
    }
  }, [])

  const updatedAt = draft?.updatedAt
  const pending = draft?.pendingSync === true
  const step = draft?.step

  useEffect(() => {
    if (!active) {
      setStatus((current) => (current.state === "off" ? current : { state: "off" }))
      return
    }
    if (!pending) return
    const timer = setTimeout(() => void push(), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [active, pending, updatedAt, push])

  // Moving to another step is a natural checkpoint, and generation steps take
  // long enough that waiting on the debounce would leave the account behind.
  useEffect(() => {
    if (active && pending) void push()
    // Keyed on the step alone; edits within a step go through the debounce.
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Hiding the tab is the last reliable moment before it may be closed.
  useEffect(() => {
    if (!active) return
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void push()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [active, push])

  return { status, flush: push }
}
