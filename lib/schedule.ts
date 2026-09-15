/**
 * Scheduling and the to-do list, at the level of actions (PRD D1 = (b)).
 *
 * Pure — no network, no storage, no clock unless one is passed in — so the
 * rules that move dates around are tested directly. Dates are calendar days
 * written "YYYY-MM-DD" and computed in UTC, so the time zone of the machine
 * running this never shifts a day. "Today" is resolved by the caller in the
 * plan's own time zone (`todayIn`).
 */

import { TZDate } from "@date-fns/tz"
import { addBusinessDays, addDays, isWeekend } from "date-fns"

import { breakCycles, isComplete } from "./graph.ts"
import { isUuid } from "./plan-sync.ts"
import { isProgressValue, type ActionDependency, type ProgressValue } from "./types.ts"

export type ScheduleMode = "calendar" | "workdays"
export const SCHEDULE_MODES: readonly ScheduleMode[] = ["calendar", "workdays"]

/** An action with the planning fields the tracking phase adds. */
export interface PlannedAction {
  id: string
  subgoalId: string
  /** 1–8, the area's position plus one. */
  area: number
  position: number
  content: string
  progress: ProgressValue
  startDate: string | null
  /** Days of work. Null while nobody has said how long it takes. */
  estimateDays: number | null
  dueDate: string | null
  /** A date a person chose; automatic scheduling never moves it. */
  dateLocked: boolean
  /** Position in the to-do list after a person reordered it. */
  todoRank: number | null
  completedAt: string | null
}

// ---------------------------------------------------------------------------
// Calendar days
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000
const pad = (n: number) => String(n).padStart(2, "0")

function dateParts(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const check = new Date(Date.UTC(year, month - 1, day))
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
    ? [year, month, day]
    : null
}

/** A real calendar day written YYYY-MM-DD — "2026-02-30" is not one. */
export function isDateString(value: unknown): value is string {
  return typeof value === "string" && dateParts(value) !== null
}

function toDate(day: string): TZDate {
  const parts = dateParts(day)
  if (!parts) throw new RangeError(`not a calendar day: ${day}`)
  return new TZDate(parts[0], parts[1] - 1, parts[2], "UTC")
}

function toDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** Today's date where the plan's owner is. An unknown zone falls back to UTC. */
export function todayIn(timeZone: string | null | undefined, now: Date = new Date()): string {
  return toDay(new TZDate(now.getTime(), isTimeZone(timeZone) ? timeZone : "UTC"))
}

/** Moves a day forward or back; in workdays mode Saturdays and Sundays are skipped. */
export function shiftDays(day: string, amount: number, mode: ScheduleMode = "calendar"): string {
  return toDay(mode === "workdays" ? addBusinessDays(toDate(day), amount) : addDays(toDate(day), amount))
}

/** The day itself, or in workdays mode the Monday after a weekend. */
export function firstWorkingDay(day: string, mode: ScheduleMode): string {
  if (mode === "calendar") return day
  let date = toDate(day)
  while (isWeekend(date)) date = addDays(date, 1)
  return toDay(date)
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS)
}

/** The last day of work for something starting on `start` and taking `days`. */
export function endOf(start: string, days: number, mode: ScheduleMode): string {
  return shiftDays(start, Math.max(1, days) - 1, mode)
}

/** ISO days sort as text, so the later one is the larger string. */
const later = (a: string, b: string) => (a > b ? a : b)

// ---------------------------------------------------------------------------
// Forward pass (FR-2.2, 2.3, 2.4)
// ---------------------------------------------------------------------------

export interface ScheduleEntry {
  id: string
  /** Where the action lands. Null when it has no estimate yet — "not scheduled". */
  slot: { start: string; end: string } | null
  /**
   * Unfinished prerequisites still running on the day this action starts.
   * Only a date that is kept as it is — locked, or already done — can end up
   * here; everything else is moved past its prerequisites instead.
   */
  conflicts: string[]
  /** Unfinished prerequisites with no estimate. Their end is unknown, so this start may be early. */
  unknownPrerequisites: string[]
}

export interface ScheduleOptions {
  mode: ScheduleMode
  today: string
}

/**
 * The earliest dates every action can have, following its prerequisites.
 *
 * - An action with no estimate gets no dates, and does not hold anything up.
 * - A locked date is kept, and any prerequisite that overlaps it is reported
 *   rather than moving it (FR-2.3, 2.4).
 * - Otherwise an action starts on its own date, or today if it has none, or
 *   the day after its last unfinished prerequisite ends — whichever is latest.
 * - Finished prerequisites never hold anything up.
 */
export function forwardPass(
  actions: PlannedAction[],
  dependencies: ActionDependency[],
  options: ScheduleOptions,
): Map<string, ScheduleEntry> {
  const byId = new Map(actions.map((action) => [action.id, action]))
  const prerequisites = new Map<string, string[]>()
  for (const edge of breakCycles(dependencies).edges) {
    if (!byId.has(edge.actionId) || !byId.has(edge.dependsOnId)) continue
    const list = prerequisites.get(edge.actionId)
    if (list) list.push(edge.dependsOnId)
    else prerequisites.set(edge.actionId, [edge.dependsOnId])
  }

  const entries = new Map<string, ScheduleEntry>()

  const visit = (id: string): ScheduleEntry => {
    const known = entries.get(id)
    if (known) return known

    const action = byId.get(id)!
    const entry: ScheduleEntry = { id, slot: null, conflicts: [], unknownPrerequisites: [] }
    // Registered before recursing. breakCycles leaves a DAG, so this is only a
    // guard; a revisit sees an entry without dates rather than looping.
    entries.set(id, entry)

    const before: ScheduleEntry[] = []
    let earliest: string | null = null
    for (const prerequisiteId of prerequisites.get(id) ?? []) {
      if (isComplete(byId.get(prerequisiteId)!.progress)) continue
      const prerequisite = visit(prerequisiteId)
      if (!prerequisite.slot) {
        entry.unknownPrerequisites.push(prerequisiteId)
        continue
      }
      before.push(prerequisite)
      const next = shiftDays(prerequisite.slot.end, 1)
      earliest = earliest === null ? next : later(earliest, next)
    }

    if (action.estimateDays === null) return entry

    const kept = action.startDate !== null && (action.dateLocked || isComplete(action.progress))
    let start: string
    if (kept) {
      start = action.startDate!
      entry.conflicts = before.filter((p) => p.slot!.end >= start).map((p) => p.id)
    } else {
      start = action.startDate ?? options.today
      if (earliest !== null) start = later(start, earliest)
      start = firstWorkingDay(start, options.mode)
    }

    entry.slot = { start, end: endOf(start, action.estimateDays, options.mode) }
    return entry
  }

  for (const action of actions) visit(action.id)
  return entries
}

/**
 * The start dates applying a forward pass would change — the preview shown
 * before anything is written (FR-2.3). Locked and finished actions never move.
 */
export function scheduleChanges(
  actions: PlannedAction[],
  entries: Map<string, ScheduleEntry>,
): { id: string; startDate: string }[] {
  return actions.flatMap((action) => {
    if (action.dateLocked || isComplete(action.progress)) return []
    const slot = entries.get(action.id)?.slot
    return slot && slot.start !== action.startDate ? [{ id: action.id, startDate: slot.start }] : []
  })
}

// ---------------------------------------------------------------------------
// To-do list (FR-1.2, 1.3, 1.5, 1.6)
// ---------------------------------------------------------------------------

export type TodoGroup = "now" | "waiting" | "done"
export type TodoView = "today" | "week" | "waiting" | "done"
export const TODO_VIEWS: readonly TodoView[] = ["today", "week", "waiting", "done"]

/** Why an action sits where it does — one line each on the card. */
export type TodoReason =
  | { kind: "unlocks"; count: number }
  | { kind: "overdue"; days: number }
  | { kind: "dueSoon"; days: number }
  | { kind: "behindArea"; area: number }

export interface TodoItem {
  action: PlannedAction
  group: TodoGroup
  /** Unfinished prerequisites. */
  blockedBy: string[]
  /** Unfinished actions that finishing this one would make startable. */
  unlocks: number
  score: number
  reasons: TodoReason[]
}

/** How close a deadline has to be before it counts. */
export const DUE_SOON_DAYS = 7
/** How far below the plan's average an area has to fall to be "behind". */
export const BEHIND_MARGIN = 10

/**
 * Every action as a to-do item, with a group and a score.
 *
 * The score is deterministic and explainable (FR-1.3): unblocking other work
 * counts most per action, an overdue deadline outranks a close one, and an
 * area that has fallen behind the rest of the plan gets a nudge. Each part
 * that contributed is listed in `reasons`.
 */
export function buildTodo(
  actions: PlannedAction[],
  dependencies: ActionDependency[],
  today: string,
): TodoItem[] {
  const byId = new Map(actions.map((action) => [action.id, action]))
  const prerequisites = new Map<string, string[]>()
  const dependents = new Map<string, string[]>()
  for (const edge of breakCycles(dependencies).edges) {
    if (!byId.has(edge.actionId) || !byId.has(edge.dependsOnId)) continue
    prerequisites.set(edge.actionId, [...(prerequisites.get(edge.actionId) ?? []), edge.dependsOnId])
    dependents.set(edge.dependsOnId, [...(dependents.get(edge.dependsOnId) ?? []), edge.actionId])
  }
  const unfinished = (id: string) => !isComplete(byId.get(id)!.progress)

  const areaTotals = new Map<number, { sum: number; count: number }>()
  let planSum = 0
  for (const action of actions) {
    const total = areaTotals.get(action.area) ?? { sum: 0, count: 0 }
    total.sum += action.progress
    total.count += 1
    areaTotals.set(action.area, total)
    planSum += action.progress
  }
  const planAverage = actions.length > 0 ? planSum / actions.length : 0

  return actions.map((action) => {
    if (isComplete(action.progress)) {
      return { action, group: "done", blockedBy: [], unlocks: 0, score: 0, reasons: [] }
    }

    const blockedBy = (prerequisites.get(action.id) ?? []).filter(unfinished)
    const unlocks = (dependents.get(action.id) ?? []).filter(
      (dependent) =>
        unfinished(dependent) &&
        (prerequisites.get(dependent) ?? []).every((p) => p === action.id || !unfinished(p)),
    ).length

    const reasons: TodoReason[] = []
    let score = 0
    if (unlocks > 0) {
      reasons.push({ kind: "unlocks", count: unlocks })
      score += unlocks * 3
    }
    if (action.dueDate) {
      const days = daysBetween(today, action.dueDate)
      if (days < 0) {
        reasons.push({ kind: "overdue", days: -days })
        score += 20 + Math.min(-days, 10)
      } else if (days <= DUE_SOON_DAYS) {
        reasons.push({ kind: "dueSoon", days })
        score += DUE_SOON_DAYS + 1 - days
      }
    }
    const area = areaTotals.get(action.area)!
    if (area.sum / area.count < planAverage - BEHIND_MARGIN) {
      reasons.push({ kind: "behindArea", area: action.area })
      score += 4
    }

    return {
      action,
      group: blockedBy.length === 0 ? "now" : "waiting",
      blockedBy,
      unlocks,
      score,
      reasons,
    }
  })
}

const GROUP_ORDER: Record<TodoGroup, number> = { now: 0, waiting: 1, done: 2 }

/**
 * Display order: by group, then the order a person dragged things into, then
 * score. Actions nobody has ranked follow the ranked ones, so dragging one item
 * never scatters the rest.
 */
export function orderTodo(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => {
    const group = GROUP_ORDER[a.group] - GROUP_ORDER[b.group]
    if (group !== 0) return group
    const rankA = a.action.todoRank
    const rankB = b.action.todoRank
    if (rankA !== null || rankB !== null) {
      if (rankA === null) return 1
      if (rankB === null) return -1
      if (rankA !== rankB) return rankA - rankB
    }
    return (
      b.score - a.score ||
      a.action.area - b.action.area ||
      a.action.position - b.action.position
    )
  })
}

/** Whether an item belongs in a view (FR-1.5). `entries` supplies computed dates. */
export function inView(
  item: TodoItem,
  view: TodoView,
  today: string,
  entries?: Map<string, ScheduleEntry>,
): boolean {
  const slot = entries?.get(item.action.id)?.slot ?? null
  switch (view) {
    case "today":
      return (
        item.group === "now" &&
        (slot === null || slot.start <= today || (item.action.dueDate !== null && item.action.dueDate <= today))
      )
    case "week": {
      if (item.group === "done") return false
      const weekEnd = shiftDays(today, 6)
      return (slot !== null && slot.start <= weekEnd) || (item.action.dueDate !== null && item.action.dueDate <= weekEnd)
    }
    case "waiting":
      return item.group === "waiting"
    case "done":
      return item.group === "done"
  }
}

/** Ranks for a list a person just reordered; only the ones that changed. */
export function rankChanges(
  orderedIds: string[],
  actions: PlannedAction[],
): { id: string; todoRank: number }[] {
  const byId = new Map(actions.map((action) => [action.id, action]))
  return orderedIds.flatMap((id, index) => {
    const action = byId.get(id)
    return action && action.todoRank !== index + 1 ? [{ id, todoRank: index + 1 }] : []
  })
}

// ---------------------------------------------------------------------------
// Prerequisites (FR-1.7)
// ---------------------------------------------------------------------------

/**
 * Whether making `actionId` wait on `dependsOnId` would close a loop — that is,
 * whether `actionId` is already, directly or not, something `dependsOnId`
 * waits on. Such an edge is refused with a reason, never silently dropped.
 */
export function wouldCreateCycle(
  dependencies: ActionDependency[],
  actionId: string,
  dependsOnId: string,
): boolean {
  if (actionId === dependsOnId) return true
  const prerequisites = new Map<string, string[]>()
  for (const edge of dependencies) {
    prerequisites.set(edge.actionId, [...(prerequisites.get(edge.actionId) ?? []), edge.dependsOnId])
  }
  const seen = new Set<string>()
  const stack = [dependsOnId]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === actionId) return true
    if (seen.has(current)) continue
    seen.add(current)
    stack.push(...(prerequisites.get(current) ?? []))
  }
  return false
}

// ---------------------------------------------------------------------------
// Validating changes before they are sent to the database
// ---------------------------------------------------------------------------

export interface ActionChange {
  id: string
  startDate?: string | null
  estimateDays?: number | null
  dueDate?: string | null
  dateLocked?: boolean
  todoRank?: number | null
  progress?: ProgressValue
}

/** Matches the limit in update_plan_actions. */
export const MAX_CHANGES = 64
export const MAX_ESTIMATE_DAYS = 365

const CHANGE_KEYS = new Set(["id", "startDate", "estimateDays", "dueDate", "dateLocked", "todoRank", "progress"])

/**
 * Checks changes on the server boundary before they reach the database.
 *
 * The database checks again; this exists so a bad change is refused with a
 * reason, and so a batch never gets half-way through before failing.
 */
export function validateChanges(
  input: unknown,
): { ok: true; changes: ActionChange[] } | { ok: false; reason: string } {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, reason: "empty" }
  if (input.length > MAX_CHANGES) return { ok: false, reason: "too-many" }

  const seen = new Set<string>()
  const changes: ActionChange[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "shape" }
    const value = raw as Record<string, unknown>
    if (Object.keys(value).some((key) => !CHANGE_KEYS.has(key))) return { ok: false, reason: "shape" }
    if (!isUuid(value.id) || seen.has(value.id)) return { ok: false, reason: "id" }
    seen.add(value.id)

    const change: ActionChange = { id: value.id }
    for (const key of ["startDate", "dueDate"] as const) {
      if (!(key in value)) continue
      if (value[key] !== null && !isDateString(value[key])) return { ok: false, reason: "date" }
      change[key] = value[key] as string | null
    }
    if ("estimateDays" in value) {
      const days = value.estimateDays
      if (days !== null && !(Number.isInteger(days) && (days as number) >= 1 && (days as number) <= MAX_ESTIMATE_DAYS)) {
        return { ok: false, reason: "estimate" }
      }
      change.estimateDays = days as number | null
    }
    if ("dateLocked" in value) {
      if (typeof value.dateLocked !== "boolean") return { ok: false, reason: "shape" }
      change.dateLocked = value.dateLocked
    }
    if ("todoRank" in value) {
      const rank = value.todoRank
      if (rank !== null && !(Number.isInteger(rank) && (rank as number) >= 1 && (rank as number) <= 10_000)) {
        return { ok: false, reason: "rank" }
      }
      change.todoRank = rank as number | null
    }
    if ("progress" in value) {
      if (typeof value.progress !== "number" || !isProgressValue(value.progress)) {
        return { ok: false, reason: "progress" }
      }
      change.progress = value.progress
    }
    if (Object.keys(change).length === 1) return { ok: false, reason: "empty" }
    changes.push(change)
  }
  return { ok: true, changes }
}
