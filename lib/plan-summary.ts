/**
 * What the dashboard knows about each plan, worked out from database rows.
 *
 * Pure — no network, no storage, and no clock unless one is passed in — so the
 * numbers on a card, and which cards a tab, search and sort leave on screen,
 * are tested directly. The server action reads the rows; the screen only
 * arranges what comes out of here.
 */

import { MAIN_GOAL_MAX } from "./plan-sync.ts"
import {
  ACTIONS_PER_SUBGOAL,
  LANGUAGES,
  SUBGOAL_COUNT,
  TOTAL_ACTIONS,
  type ActionDependency,
  type AppStep,
  type EditorCell,
  type EditorDraft,
  type Language,
} from "./types.ts"

/**
 * The badge on a card. Derived rather than stored: "writing" is a plan whose
 * 64 cells are not finished yet, which the step already says.
 */
export type DisplayStatus = "writing" | "active" | "completed" | "archived"

export type DashboardTab = "all" | "active" | "completed" | "archived"
export type DashboardSort = "activity" | "created" | "progress" | "name"

export const DASHBOARD_TABS: readonly DashboardTab[] = ["all", "active", "completed", "archived"]
export const DASHBOARD_SORTS: readonly DashboardSort[] = ["activity", "created", "progress", "name"]

// ---------------------------------------------------------------------------
// Rows → summaries
// ---------------------------------------------------------------------------

export interface PlanRow {
  id: string
  main_goal: string
  language: string
  status: string
  step: string
  pinned: boolean
  created_at: string
  updated_at: string
  last_activity_at: string
  completed_at: string | null
  archived_at: string | null
}

export interface SubgoalRow {
  id: string
  plan_id: string
  position: number
}

export interface ActionRow {
  plan_id: string
  subgoal_id: string
  progress: number
}

export interface PlanSummary {
  id: string
  mainGoal: string
  language: Language
  status: DisplayStatus
  /** Still filling in the 64 cells, as opposed to working through them. */
  drafting: boolean
  pinned: boolean
  createdAt: string
  lastActivityAt: string
  /** Subgoals the account holds. Zero means the content never reached it. */
  subgoalCount: number
  /** Actions written, of TOTAL_ACTIONS. */
  filled: number
  /** Actions at 100%. */
  done: number
  /** Whole-plan progress, 0–100, counted over all 64 cells. */
  progress: number
  /**
   * One number per area, area 1 first, always eight long: how much of the
   * area is written while drafting, its average progress after that.
   */
  areas: number[]
}

export function displayStatus(plan: Pick<PlanRow, "status" | "step" | "archived_at">): DisplayStatus {
  if (plan.status === "archived" || plan.archived_at !== null) return "archived"
  if (plan.status === "completed") return "completed"
  return plan.step === "visualization" ? "active" : "writing"
}

/**
 * When the plan was last worked on.
 *
 * Adding `last_activity_at` stamped every plan that already existed with the
 * moment the column arrived. Real activity also updates the plans row, so a
 * value later than `updated_at` is that stamp — the earlier of the two is the
 * true time. Pinning or archiving moves only `updated_at`, and loses here too.
 */
function lastActivity(plan: Pick<PlanRow, "last_activity_at" | "updated_at">): string {
  return moment(plan.updated_at) < moment(plan.last_activity_at)
    ? plan.updated_at
    : plan.last_activity_at
}

/** One plan's card, from that plan's own rows. */
export function summarize(plan: PlanRow, subgoals: SubgoalRow[], actions: ActionRow[]): PlanSummary {
  const areaOf = new Map(
    [...subgoals]
      .sort((a, b) => a.position - b.position)
      .slice(0, SUBGOAL_COUNT)
      .map((subgoal, index) => [subgoal.id, index]),
  )

  const written = new Array<number>(SUBGOAL_COUNT).fill(0)
  const progressSum = new Array<number>(SUBGOAL_COUNT).fill(0)
  let done = 0
  for (const action of actions) {
    const area = areaOf.get(action.subgoal_id)
    if (area === undefined || written[area] >= ACTIONS_PER_SUBGOAL) continue
    const progress = Math.min(100, Math.max(0, action.progress))
    written[area] += 1
    progressSum[area] += progress
    if (progress === 100) done += 1
  }

  const drafting = plan.step !== "visualization"
  const total = progressSum.reduce((sum, value) => sum + value, 0)

  return {
    id: plan.id,
    mainGoal: plan.main_goal,
    language: LANGUAGES.includes(plan.language as Language) ? (plan.language as Language) : "en",
    status: displayStatus(plan),
    drafting,
    pinned: plan.pinned,
    createdAt: plan.created_at,
    lastActivityAt: lastActivity(plan),
    subgoalCount: areaOf.size,
    filled: written.reduce((sum, value) => sum + value, 0),
    done,
    progress: Math.round(total / TOTAL_ACTIONS),
    areas: written.map((count, area) =>
      drafting
        ? Math.round((count / ACTIONS_PER_SUBGOAL) * 100)
        : Math.round(progressSum[area] / ACTIONS_PER_SUBGOAL),
    ),
  }
}

/** Every plan's card, from rows read for many plans at once. */
export function summarizeAll(
  plans: PlanRow[],
  subgoals: SubgoalRow[],
  actions: ActionRow[],
): PlanSummary[] {
  const byPlan = <T extends { plan_id: string }>(rows: T[]) => {
    const grouped = new Map<string, T[]>()
    for (const row of rows) {
      const list = grouped.get(row.plan_id)
      if (list) list.push(row)
      else grouped.set(row.plan_id, [row])
    }
    return grouped
  }
  const subgoalsByPlan = byPlan(subgoals)
  const actionsByPlan = byPlan(actions)
  return plans.map((plan) =>
    summarize(plan, subgoalsByPlan.get(plan.id) ?? [], actionsByPlan.get(plan.id) ?? []),
  )
}

// ---------------------------------------------------------------------------
// Tabs, search, sort
// ---------------------------------------------------------------------------

/** "All" means everything not archived: archiving is how a plan leaves the list. */
export function inTab(plan: PlanSummary, tab: DashboardTab): boolean {
  switch (tab) {
    case "all":
      return plan.status !== "archived"
    case "active":
      return plan.status === "writing" || plan.status === "active"
    case "completed":
      return plan.status === "completed"
    case "archived":
      return plan.status === "archived"
  }
}

export function tabCounts(plans: PlanSummary[]): Record<DashboardTab, number> {
  const counts = { all: 0, active: 0, completed: 0, archived: 0 }
  for (const plan of plans) {
    for (const tab of DASHBOARD_TABS) if (inTab(plan, tab)) counts[tab] += 1
  }
  return counts
}

/**
 * The tab to open on: the one chosen last time, otherwise In progress — unless
 * nothing is in progress, so a first visit never lands on an empty list.
 */
export function initialTab(plans: PlanSummary[], remembered?: DashboardTab): DashboardTab {
  if (remembered) return remembered
  return plans.some((plan) => inTab(plan, "active")) ? "active" : "all"
}

/** Folds case, spacing and full-width forms, so a search matches however it was typed. */
export function searchKey(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim()
}

export function matchesQuery(plan: PlanSummary, query: string): boolean {
  const key = searchKey(query)
  return key === "" || searchKey(plan.mainGoal).includes(key)
}

/** Timestamps compared as moments: as text, 18:00+09:00 would sort after 10:00+00:00. */
function moment(iso: string): number {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? 0 : time
}

/** Pinned plans first, then the chosen order. Returns a new array. */
export function sortPlans(
  plans: PlanSummary[],
  sort: DashboardSort,
  locale: string,
): PlanSummary[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true })

  const primary = (a: PlanSummary, b: PlanSummary): number => {
    switch (sort) {
      case "activity":
        return moment(b.lastActivityAt) - moment(a.lastActivityAt)
      case "created":
        return moment(b.createdAt) - moment(a.createdAt)
      case "progress":
        // Nothing is done while plans are being written, so the tie goes to
        // whichever is further along in writing.
        return b.progress - a.progress || b.filled - a.filled
      case "name":
        return collator.compare(a.mainGoal, b.mainGoal)
    }
  }

  return [...plans].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      primary(a, b) ||
      moment(b.lastActivityAt) - moment(a.lastActivityAt) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}

export interface DashboardView {
  tab: DashboardTab
  sort: DashboardSort
  query: string
}

export function visiblePlans(
  plans: PlanSummary[],
  view: DashboardView,
  locale: string,
): PlanSummary[] {
  return sortPlans(
    plans.filter((plan) => inTab(plan, view.tab) && matchesQuery(plan, view.query)),
    view.sort,
    locale,
  )
}

/** The line above the list. The archive is left out of all three figures. */
export function overview(plans: PlanSummary[]): {
  inProgress: number
  completed: number
  lastActivityAt: string | null
} {
  let lastActivityAt: string | null = null
  for (const plan of plans) {
    if (plan.status === "archived") continue
    if (lastActivityAt === null || moment(plan.lastActivityAt) > moment(lastActivityAt)) {
      lastActivityAt = plan.lastActivityAt
    }
  }
  const counts = tabCounts(plans)
  return { inProgress: counts.active, completed: counts.completed, lastActivityAt }
}

export interface DashboardPrefs {
  tab?: DashboardTab
  sort?: DashboardSort
}

/** A remembered tab and sort. Anything unrecognised is dropped, never thrown. */
export function parsePrefs(raw: string | null): DashboardPrefs {
  let value: unknown
  try {
    value = raw ? JSON.parse(raw) : null
  } catch {
    return {}
  }
  if (!value || typeof value !== "object") return {}

  const { tab, sort } = value as Record<string, unknown>
  const prefs: DashboardPrefs = {}
  if (DASHBOARD_TABS.includes(tab as DashboardTab)) prefs.tab = tab as DashboardTab
  if (DASHBOARD_SORTS.includes(sort as DashboardSort)) prefs.sort = sort as DashboardSort
  return prefs
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** A main goal as it may be stored — trimmed, 1–500 characters — or null. */
export function cleanGoalName(text: string): string | null {
  const name = text.trim()
  return name.length > 0 && name.length <= MAIN_GOAL_MAX ? name : null
}

/**
 * "{goal} (copy)" in the reader's language.
 *
 * A goal near the length limit is shortened rather than the suffix, which is
 * the part that tells the copy from the original.
 */
export function copyName(goal: string, template: string): string {
  const room = MAIN_GOAL_MAX - template.replace("{goal}", "").length
  const trimmed = goal.trim()
  const fitted = trimmed.length <= room ? trimmed : `${trimmed.slice(0, Math.max(0, room - 1))}…`
  return template.replace("{goal}", fitted).trim()
}

/**
 * Whether what was typed names the plan about to be deleted.
 *
 * Only surrounding spaces and Unicode normal form are forgiven: an IME or a
 * paste can produce either form of the same text, and neither is a slip.
 */
export function confirmsGoal(typed: string, goal: string): boolean {
  const expected = goal.normalize("NFC").trim()
  return expected.length > 0 && typed.normalize("NFC").trim() === expected
}

// ---------------------------------------------------------------------------
// Drafts in this browser
// ---------------------------------------------------------------------------

export interface UnsavedDraft {
  draft: EditorDraft
  /** `import`: the account has no such plan. `upload`: it has the plan but not this content. */
  kind: "import" | "upload"
}

/**
 * Drafts in this browser whose content the account does not hold.
 *
 * A copy that once reached an account but is not in this one belongs to
 * someone else who signed in on this browser earlier. It is left out: offering
 * to save it would copy another person's plan into this account.
 */
export function unsavedLocalDrafts(local: EditorDraft[], account: PlanSummary[]): UnsavedDraft[] {
  const byId = new Map(account.map((plan) => [plan.id, plan]))
  const unsaved: UnsavedDraft[] = []
  for (const draft of local) {
    if (draft.subgoals.length === 0) continue
    const server = byId.get(draft.id)
    if (!server) {
      if (draft.serverSyncedAt === undefined) unsaved.push({ draft, kind: "import" })
      continue
    }
    if (server.subgoalCount === 0 || draft.pendingSync === true) {
      unsaved.push({ draft, kind: "upload" })
    }
  }
  return unsaved
}

// ---------------------------------------------------------------------------
// Duplicating
// ---------------------------------------------------------------------------

/**
 * The same Mandalart under new ids, to start again from.
 *
 * Every id is new — a row id can belong to one plan only, and reusing one
 * would make saving the copy overwrite the original. Progress and reports are
 * not part of a draft, so they are left behind by construction. A copy never
 * opens on a step that runs generation, which would spend quota on content it
 * already has.
 */
export function duplicateDraft(
  source: EditorDraft,
  copy: { id: string; mainGoal: string; now: string },
  makeId: () => string,
): EditorDraft {
  const ids = new Map<string, string>()
  const fresh = (cell: EditorCell): EditorCell => {
    const id = makeId()
    ids.set(cell.id, id)
    return { ...cell, id, isEditing: false }
  }

  const subgoals = source.subgoals.map(fresh)
  const actions: Record<string, EditorCell[]> = {}
  source.subgoals.forEach((subgoal, index) => {
    actions[subgoals[index].id] = (source.actions[subgoal.id] ?? []).map(fresh)
  })

  const dependencies: ActionDependency[] = source.dependencies.flatMap((edge) => {
    const actionId = ids.get(edge.actionId)
    const dependsOnId = ids.get(edge.dependsOnId)
    return actionId && dependsOnId ? [{ ...edge, actionId, dependsOnId }] : []
  })

  const step: AppStep =
    source.step === "generating-actions" || source.step === "analyzing-order"
      ? "review-actions"
      : source.step

  return {
    id: copy.id,
    mainGoal: copy.mainGoal,
    language: source.language,
    step,
    subgoals,
    actions,
    dependencies,
    createdAt: copy.now,
    updatedAt: copy.now,
    pendingSync: false,
  }
}
