/**
 * Domain model for the Mandalart planner.
 *
 * Shapes here mirror the Supabase schema in `supabase/schema.sql` and carry no
 * UI state — `isEditing` and friends belong to components, not to rows we save.
 */

export type Language = "ko" | "en" | "fi"

export const LANGUAGES: Language[] = ["ko", "en", "fi"]

/** A Mandalart always has exactly 8 subgoals, each with exactly 8 actions. */
export const SUBGOAL_COUNT = 8
export const ACTIONS_PER_SUBGOAL = 8
export const TOTAL_ACTIONS = SUBGOAL_COUNT * ACTIONS_PER_SUBGOAL // 64

/** Position of a subgoal (0–7) or of an action within its subgoal (0–7). */
export type Position = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Five stages from 10% to 100%. Anything not started sits at 0, which is
 * deliberately outside the ladder — "not started" is not a degree of progress.
 *
 * The rungs are uneven on purpose: starting is the hard part, so the first
 * step is cheap, and the gap widens as the work gets closer to done.
 */
export const PROGRESS_STAGES = [10, 25, 50, 75, 100] as const
export type ProgressStage = (typeof PROGRESS_STAGES)[number]

/** 0 (not started) plus the five stages. This is the full set of valid values. */
export type ProgressValue = 0 | ProgressStage

export const PROGRESS_VALUES: ProgressValue[] = [0, ...PROGRESS_STAGES]

export function isProgressValue(n: number): n is ProgressValue {
  return (PROGRESS_VALUES as number[]).includes(n)
}

/**
 * Snaps an arbitrary percentage onto the nearest valid rung.
 *
 * The model is asked for one of the five stages, but a free-text conversion can
 * still come back with something like 60 — round it rather than reject the
 * user's update.
 */
export function snapToStage(pct: number): ProgressValue {
  const clamped = Math.max(0, Math.min(100, pct))
  return PROGRESS_VALUES.reduce((best, value) =>
    Math.abs(value - clamped) < Math.abs(best - clamped) ? value : best,
  )
}

/** Translation key for a progress value, e.g. `progress.stage.50`. */
export function progressLabelKey(value: ProgressValue): string {
  return `progress.stage.${value}`
}

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export type PlanStatus = "draft" | "active" | "archived"

export interface Plan {
  id: string
  /** Null while the plan is an anonymous draft. */
  ownerId: string | null
  /** Present only on anonymous drafts; the sole way to reach one. */
  draftToken: string | null
  mainGoal: string
  language: Language
  status: PlanStatus
  createdAt: string
  updatedAt: string
  /** Set on anonymous drafts (24h out); cleared when a plan is claimed. */
  expiresAt: string | null
}

export interface Subgoal {
  id: string
  planId: string
  position: Position
  content: string
}

export type ActionCadence = "once" | "weekly" | "monthly"

export interface Action {
  id: string
  planId: string
  subgoalId: string
  position: Position
  content: string
  /** How the user will know this is done. Optional — not every action has one. */
  metric: string | null
  cadence: ActionCadence
  dueDate: string | null
  progress: ProgressValue
  updatedAt: string
}

/**
 * A directed edge: `actionId` cannot start until `dependsOnId` reaches 100%.
 *
 * The set of edges for a plan is kept acyclic — see `lib/graph.ts`. Confidence
 * is what the cycle breaker uses to decide which edge to drop.
 */
export interface ActionDependency {
  actionId: string
  dependsOnId: string
  rationale: string
  confidence: number
  /** True once a user has edited or confirmed this edge, protecting it from
   *  automatic removal when dependencies are re-analyzed. */
  userEdited: boolean
}

/**
 * One free-text progress note plus the percentage it was read as.
 *
 * The raw text is the real record; the percentage is a summary of it. Quarterly
 * reviews read these back, so they are never overwritten.
 */
export interface ProgressLog {
  id: string
  actionId: string
  rawText: string
  inferredProgress: ProgressValue
  /** What the user actually saved, which may differ from the inference. */
  confirmedProgress: ProgressValue
  confidence: number
  createdAt: string
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

/** A whole Mandalart, as the editor and tracking views consume it. */
export interface PlanBundle {
  plan: Plan
  subgoals: Subgoal[]
  actions: Action[]
  dependencies: ActionDependency[]
}

/** Groups a bundle's actions by subgoal id, preserving position order. */
export function actionsBySubgoal(bundle: PlanBundle): Map<string, Action[]> {
  const grouped = new Map<string, Action[]>()
  for (const subgoal of bundle.subgoals) grouped.set(subgoal.id, [])
  for (const action of bundle.actions) {
    const list = grouped.get(action.subgoalId)
    if (list) list.push(action)
  }
  for (const list of grouped.values()) list.sort((a, b) => a.position - b.position)
  return grouped
}

/** Whole-plan completion, averaged over every action. */
export function planProgress(bundle: PlanBundle): number {
  if (bundle.actions.length === 0) return 0
  const total = bundle.actions.reduce((sum, a) => sum + a.progress, 0)
  return Math.round(total / bundle.actions.length)
}

/** Completion for one subgoal's eight actions. */
export function subgoalProgress(bundle: PlanBundle, subgoalId: string): number {
  const actions = bundle.actions.filter((a) => a.subgoalId === subgoalId)
  if (actions.length === 0) return 0
  const total = actions.reduce((sum, a) => sum + a.progress, 0)
  return Math.round(total / actions.length)
}

// ---------------------------------------------------------------------------
// Editor-only state
// ---------------------------------------------------------------------------

/**
 * A cell as the review screens handle it.
 *
 * This is where `isEditing` belongs — it describes a text box, not a goal, and
 * it never reaches the database.
 */
export interface EditorCell {
  id: string
  content: string
  metric: string | null
  isConfirmed: boolean
  isEditing: boolean
}

export type AppStep =
  | "review-subgoals"
  | "generating-actions"
  | "review-actions"
  | "visualization"

/**
 * A Mandalart being built, as saved to the browser between steps.
 *
 * Actions are keyed by the id of their subgoal cell. This is the shape that
 * survives a refresh today; once Supabase is wired it becomes the local mirror
 * of a `plans` row rather than the only copy.
 */
export interface EditorDraft {
  id: string
  mainGoal: string
  language: Language
  step: AppStep
  subgoals: EditorCell[]
  actions: Record<string, EditorCell[]>
  createdAt: string
  updatedAt: string
}

/** Every action across every subgoal, in subgoal order. */
export function draftActions(draft: EditorDraft): EditorCell[] {
  return draft.subgoals.flatMap((subgoal) => draft.actions[subgoal.id] ?? [])
}

/** True once all eight subgoals and all sixty-four actions are confirmed. */
export function isDraftComplete(draft: EditorDraft): boolean {
  const actions = draftActions(draft)
  return (
    draft.subgoals.length === SUBGOAL_COUNT &&
    draft.subgoals.every((s) => s.isConfirmed) &&
    actions.length === TOTAL_ACTIONS &&
    actions.every((a) => a.isConfirmed)
  )
}
