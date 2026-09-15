/**
 * A plan as Gantt rows, and a Gantt drag back as schedule changes.
 *
 * Pure and free of the chart library, so what a drag means — which day, how
 * many days, what else has to move — is decided here and tested, and the
 * chart component only draws and reports.
 *
 * Gantt end dates are exclusive: a one-day bar on the 14th ends on the 15th.
 * Everything in lib/schedule.ts uses the last day itself, so the conversion
 * happens only at this boundary.
 */

import {
  applyChanges,
  daysBetween,
  firstWorkingDay,
  forwardPass,
  shiftDays,
  MAX_ESTIMATE_DAYS,
  type ActionChange,
  type PlannedAction,
  type ScheduleEntry,
  type ScheduleMode,
  type ScheduleOptions,
} from "./schedule.ts"
import { snapToStage, type ActionDependency, type ProgressValue } from "./types.ts"

export interface GanttRow {
  id: string
  text: string
  /** The area row an action sits under; 0 for an area row itself. */
  parent: string | 0
  type: "project" | "task"
  /** First day, YYYY-MM-DD. An area row spans its actions. */
  start_date: string
  /** Calendar days the bar covers, weekends inside it included. */
  duration: number
  /** 0–1 */
  progress: number
  open: boolean
  /** Area rows and finished actions cannot be dragged. */
  readonly: boolean
  area: number
  /** The action's own estimate, which skips weekends when the plan does; null on area rows. */
  estimate: number | null
  locked: boolean
  done: boolean
}

export interface GanttLink {
  id: string
  source: string
  target: string
  /** Finish-to-start, the only kind a prerequisite is. */
  type: "0"
}

export const areaRowId = (area: number) => `area-${area}`
export const isAreaRowId = (id: string | number) => String(id).startsWith("area-")
export const linkId = (dependsOnId: string, actionId: string) => `${dependsOnId}>${actionId}`

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

/** The chart library writes its labels as HTML, and plan text is whatever a person typed. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])
}

/**
 * Rows for every scheduled action under its area, links between scheduled
 * actions, and the actions with no dates, which the chart lists below itself.
 */
export function ganttRows(
  subgoals: { id: string; position: number; content: string }[],
  actions: PlannedAction[],
  dependencies: ActionDependency[],
  entries: Map<string, ScheduleEntry>,
): { rows: GanttRow[]; links: GanttLink[]; unscheduled: PlannedAction[] } {
  const rows: GanttRow[] = []
  const scheduled = new Set<string>()
  const unscheduled: PlannedAction[] = []

  for (const subgoal of [...subgoals].sort((a, b) => a.position - b.position)) {
    const area = subgoal.position + 1
    const tasks: GanttRow[] = []
    let first = ""
    let last = ""
    for (const action of actions.filter((a) => a.subgoalId === subgoal.id).sort((a, b) => a.position - b.position)) {
      const slot = entries.get(action.id)?.slot
      if (!slot) {
        unscheduled.push(action)
        continue
      }
      scheduled.add(action.id)
      if (first === "" || slot.start < first) first = slot.start
      if (slot.end > last) last = slot.end
      const done = action.progress === 100
      tasks.push({
        id: action.id,
        text: action.content,
        parent: areaRowId(area),
        type: "task",
        start_date: slot.start,
        duration: daysBetween(slot.start, slot.end) + 1,
        progress: action.progress / 100,
        open: true,
        readonly: done,
        area,
        estimate: action.estimateDays,
        locked: action.dateLocked,
        done,
      })
    }
    if (tasks.length === 0) continue
    rows.push({
      id: areaRowId(area),
      text: subgoal.content,
      parent: 0,
      type: "project",
      start_date: first,
      duration: daysBetween(first, last) + 1,
      progress: 0,
      open: true,
      readonly: true,
      area,
      estimate: null,
      locked: false,
      done: false,
    })
    rows.push(...tasks)
  }

  const links: GanttLink[] = dependencies
    .filter((edge) => scheduled.has(edge.actionId) && scheduled.has(edge.dependsOnId))
    .map((edge) => ({ id: linkId(edge.dependsOnId, edge.actionId), source: edge.dependsOnId, target: edge.actionId, type: "0" }))

  return { rows, links, unscheduled }
}

/** Weekdays from `first` to `last`, both included; at least one. */
export function workingDaysInclusive(first: string, last: string): number {
  if (last < first) return 1
  let count = 0
  for (let day = first; day <= last; day = shiftDays(day, 1)) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
    if (weekday !== 0 && weekday !== 6) count += 1
  }
  return Math.max(1, count)
}

/**
 * A bar the person moved or resized, as a change.
 *
 * Moving keeps the estimate; resizing sets it from the bar's new length,
 * counted in working days when the plan skips weekends. Either way the start
 * is a date the person chose, so it is fixed (FR-2.3).
 */
export function dragChange(
  action: PlannedAction,
  start: string,
  endExclusive: string,
  mode: ScheduleMode,
  kind: "move" | "resize",
): ActionChange {
  const first = firstWorkingDay(start, mode)
  const change: ActionChange = { id: action.id, startDate: first, dateLocked: true }
  if (kind === "resize") {
    const last = shiftDays(endExclusive, -1)
    const days = mode === "workdays" ? workingDaysInclusive(first, last) : Math.max(1, daysBetween(first, last) + 1)
    change.estimateDays = Math.min(MAX_ESTIMATE_DAYS, days)
  }
  return change
}

/** A progress bar dragged to a fraction, on the nearest rung of the progress ladder. */
export function progressFromDrag(fraction: number): ProgressValue {
  return snapToStage(Math.round(Math.max(0, Math.min(1, fraction)) * 100))
}

/** A following action whose start a change moves: where it was drawn, and where it is drawn now. */
export interface Shift {
  id: string
  from: string
  startDate: string
}

/**
 * What a change to one action does to the rest of the plan (FR-3.5).
 *
 * `shifts`: unfixed actions that come after it, directly or not, whose start
 * moves because of it. An unfixed action always follows its prerequisites, so
 * the chart already draws them moved; the person chooses between saving those
 * dates and fixing the actions where they were. `conflicts`: unfinished
 * prerequisites the changed action now overlaps — its date is fixed, so it is
 * flagged instead of moved.
 */
export function dragConsequences(
  actions: PlannedAction[],
  dependencies: ActionDependency[],
  change: ActionChange,
  options: ScheduleOptions,
): { shifts: Shift[]; conflicts: string[] } {
  const before = forwardPass(actions, dependencies, options)
  const nextActions = applyChanges(actions, [change], "")
  const after = forwardPass(nextActions, dependencies, options)

  const dependents = new Map<string, string[]>()
  for (const edge of dependencies) {
    dependents.set(edge.dependsOnId, [...(dependents.get(edge.dependsOnId) ?? []), edge.actionId])
  }
  const followers = new Set<string>()
  const stack = [...(dependents.get(change.id) ?? [])]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (followers.has(id)) continue
    followers.add(id)
    stack.push(...(dependents.get(id) ?? []))
  }

  const shifts = nextActions.flatMap((action) => {
    if (!followers.has(action.id) || action.dateLocked || action.progress === 100) return []
    const was = before.get(action.id)?.slot?.start
    const now = after.get(action.id)?.slot?.start
    return was && now && was !== now ? [{ id: action.id, from: was, startDate: now }] : []
  })

  return { shifts, conflicts: after.get(change.id)?.conflicts ?? [] }
}
