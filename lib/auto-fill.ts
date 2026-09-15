/**
 * Filling a plan's blank schedule cells in one go (schedule tab).
 *
 * Only blanks: an estimate, start or deadline a person typed is never
 * replaced, and finished or empty actions are left alone. Start dates come
 * from the same forward pass as everything else — today, or after unfinished
 * prerequisites — and a blank deadline becomes the computed end, so a later
 * slip shows up as "ends after its deadline".
 */

import {
  applyChanges,
  forwardPass,
  MAX_CHANGES,
  MAX_ESTIMATE_DAYS,
  type ActionChange,
  type PlannedAction,
  type ScheduleOptions,
} from "./schedule.ts"
import type { ActionDependency } from "./types.ts"

/** Any blank estimate the model did not answer for. */
export const DEFAULT_ESTIMATE_DAYS = 7

export interface AutoFillRow {
  id: string
  estimate?: { days: number; source: "ai" | "default" }
  startDate?: string
  dueDate?: string
}

const fillable = (action: PlannedAction) => action.progress !== 100 && action.content.trim() !== ""

/** Actions whose estimate is blank and still matters: not finished, not an empty cell. */
export function needsEstimate(actions: PlannedAction[]): PlannedAction[] {
  return actions.filter((action) => fillable(action) && action.estimateDays === null)
}

/**
 * A model's answer, given by position in the list it was sent, as days per
 * action. Unknown or repeated positions are dropped; days are rounded and
 * kept within 1–365.
 */
export function estimatesFromModel(raw: { index: number; days: number }[], ids: string[]): Map<string, number> {
  const estimates = new Map<string, number>()
  for (const { index, days } of raw) {
    const id = ids[index]
    if (id === undefined || estimates.has(id) || !Number.isFinite(days)) continue
    estimates.set(id, Math.min(MAX_ESTIMATE_DAYS, Math.max(1, Math.round(days))))
  }
  return estimates
}

/** The changes that fill every blank, and what each one fills, in plan order. */
export function autoFill(
  actions: PlannedAction[],
  dependencies: ActionDependency[],
  estimates: Map<string, number>,
  options: ScheduleOptions,
): { changes: ActionChange[]; rows: AutoFillRow[] } {
  const rows = new Map<string, AutoFillRow>()
  const estimateChanges: ActionChange[] = []
  for (const action of needsEstimate(actions)) {
    const suggested = estimates.get(action.id)
    const days = suggested ?? DEFAULT_ESTIMATE_DAYS
    estimateChanges.push({ id: action.id, estimateDays: days })
    rows.set(action.id, { id: action.id, estimate: { days, source: suggested === undefined ? "default" : "ai" } })
  }

  // Dates are worked out with the new estimates in place, so what follows a filled action moves with it.
  const filled = applyChanges(actions, estimateChanges, "")
  const entries = forwardPass(filled, dependencies, options)
  for (const action of filled) {
    if (!fillable(action)) continue
    const slot = entries.get(action.id)?.slot
    if (!slot) continue
    const row = rows.get(action.id) ?? { id: action.id }
    if (action.startDate === null && !action.dateLocked) row.startDate = slot.start
    if (action.dueDate === null) row.dueDate = slot.end
    if (row.estimate || row.startDate || row.dueDate) rows.set(action.id, row)
  }

  const ordered = actions.flatMap((action) => {
    const row = rows.get(action.id)
    return row ? [row] : []
  }).slice(0, MAX_CHANGES)
  const changes: ActionChange[] = ordered.map((row) => ({
    id: row.id,
    ...(row.estimate ? { estimateDays: row.estimate.days } : {}),
    ...(row.startDate ? { startDate: row.startDate } : {}),
    ...(row.dueDate ? { dueDate: row.dueDate } : {}),
  }))
  return { changes, rows: ordered }
}
