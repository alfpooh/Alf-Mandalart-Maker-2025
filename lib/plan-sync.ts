/**
 * Moving a plan between the browser's shape and the database's.
 *
 * Pure functions only — no network, no storage — so the rules that decide what
 * gets written, and which copy wins when a plan is opened, are tested directly.
 * The server action and the editor both go through here.
 *
 * The payload is what `save_plan_content` in supabase/schema.sql accepts. The
 * database checks it again; these checks exist so a draft that cannot be saved
 * is recognised before a round trip, and the reason can be named.
 */

import {
  ACTIONS_PER_SUBGOAL,
  LANGUAGES,
  SUBGOAL_COUNT,
  type ActionDependency,
  type AppStep,
  type EditorCell,
  type EditorDraft,
  type Language,
} from "./types.ts"

/** Matches the `char_length` checks on subgoals.content and actions.content. */
export const CONTENT_MAX = 300
/** Matches the check on plans.main_goal. */
export const MAIN_GOAL_MAX = 500

/** Must match the `plans_step_check` constraint. */
export const APP_STEPS: readonly AppStep[] = [
  "review-subgoals",
  "generating-actions",
  "review-actions",
  "analyzing-order",
  "visualization",
]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value)
}

// ---------------------------------------------------------------------------
// Draft → payload
// ---------------------------------------------------------------------------

export interface PlanPayload {
  mainGoal: string
  language: Language
  step: AppStep
  subgoals: { id: string; position: number; content: string; confirmed: boolean }[]
  actions: {
    id: string
    subgoalId: string
    position: number
    content: string
    metric: string | null
    confirmed: boolean
  }[]
  dependencies: {
    actionId: string
    dependsOnId: string
    rationale: string | null
    confidence: number
    userEdited: boolean
  }[]
}

export type PayloadProblem =
  /** The draft's id is not a server plan id — a local-only draft. */
  | "not-server-plan"
  | "blank-main-goal"
  /** A subgoal is mid-edit and empty. Saving waits rather than failing. */
  | "blank-subgoal"
  | "too-long"
  /** A cell id from an older build that cannot become a database uuid. */
  | "legacy-ids"
  /** More cells than a Mandalart has, a repeated id, or an unknown value. */
  | "shape"

export type PayloadResult =
  | { ok: true; payload: PlanPayload }
  | { ok: false; reason: PayloadProblem }

/**
 * The database's view of a draft.
 *
 * Empty actions are left out rather than refused: they are the half-typed row
 * someone just added, and blocking every save until it is filled in would
 * leave the rest of the plan unsaved. Positions are counted among the actions
 * that are kept, so the stored order has no gaps.
 */
export function draftToPayload(draft: EditorDraft): PayloadResult {
  if (!isUuid(draft.id)) return { ok: false, reason: "not-server-plan" }
  if (!LANGUAGES.includes(draft.language)) return { ok: false, reason: "shape" }
  if (!APP_STEPS.includes(draft.step)) return { ok: false, reason: "shape" }

  const mainGoal = draft.mainGoal.trim()
  if (!mainGoal) return { ok: false, reason: "blank-main-goal" }
  if (mainGoal.length > MAIN_GOAL_MAX) return { ok: false, reason: "too-long" }
  if (draft.subgoals.length > SUBGOAL_COUNT) return { ok: false, reason: "shape" }

  const subgoals: PlanPayload["subgoals"] = []
  const actions: PlanPayload["actions"] = []
  const seen = new Set<string>()

  for (const [position, subgoal] of draft.subgoals.entries()) {
    if (!isUuid(subgoal.id)) return { ok: false, reason: "legacy-ids" }
    if (seen.has(subgoal.id)) return { ok: false, reason: "shape" }
    seen.add(subgoal.id)

    const content = subgoal.content.trim()
    if (!content) return { ok: false, reason: "blank-subgoal" }
    if (content.length > CONTENT_MAX) return { ok: false, reason: "too-long" }
    subgoals.push({ id: subgoal.id, position, content, confirmed: subgoal.isConfirmed })

    const kept = (draft.actions[subgoal.id] ?? []).filter((a) => a.content.trim().length > 0)
    if (kept.length > ACTIONS_PER_SUBGOAL) return { ok: false, reason: "shape" }

    for (const [index, action] of kept.entries()) {
      if (!isUuid(action.id)) return { ok: false, reason: "legacy-ids" }
      if (seen.has(action.id)) return { ok: false, reason: "shape" }
      seen.add(action.id)

      const text = action.content.trim()
      if (text.length > CONTENT_MAX) return { ok: false, reason: "too-long" }
      actions.push({
        id: action.id,
        subgoalId: subgoal.id,
        position: index,
        content: text,
        metric: action.metric?.trim() || null,
        confirmed: action.isConfirmed,
      })
    }
  }

  return {
    ok: true,
    payload: {
      mainGoal,
      language: draft.language,
      step: draft.step,
      subgoals,
      actions,
      dependencies: edgesFor(draft.dependencies ?? [], new Set(actions.map((a) => a.id))),
    },
  }
}

/** Edges whose both ends are being saved, once each, never pointing at themselves. */
function edgesFor(edges: ActionDependency[], kept: Set<string>): PlanPayload["dependencies"] {
  const out: PlanPayload["dependencies"] = []
  const seen = new Set<string>()
  for (const edge of edges) {
    if (edge.actionId === edge.dependsOnId) continue
    if (!kept.has(edge.actionId) || !kept.has(edge.dependsOnId)) continue
    const key = `${edge.actionId}>${edge.dependsOnId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      actionId: edge.actionId,
      dependsOnId: edge.dependsOnId,
      rationale: edge.rationale?.trim() || null,
      confidence: Number.isFinite(edge.confidence)
        ? Math.min(1, Math.max(0, edge.confidence))
        : 0.5,
      userEdited: edge.userEdited === true,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Rows → draft
// ---------------------------------------------------------------------------

export interface PlanRows {
  plan: {
    id: string
    main_goal: string
    language: string
    /** Absent when the database predates the persistence migration. */
    step?: string | null
    created_at: string
    updated_at: string
    last_activity_at?: string | null
  }
  subgoals: { id: string; position: number; content: string; confirmed?: boolean | null }[]
  actions: {
    id: string
    subgoal_id: string
    position: number
    content: string
    metric: string | null
    confirmed?: boolean | null
  }[]
  dependencies: {
    action_id: string
    depends_on_id: string
    rationale: string | null
    confidence: number
    user_edited: boolean
  }[]
}

/**
 * A plan read from the database, as the editor holds it.
 *
 * Returns null for a database that has not had the migration applied: without
 * `step` and the confirmed flags the plan would reopen as if nothing had been
 * reviewed, and the browser's copy is the better one to show.
 */
export function rowsToDraft(rows: PlanRows): EditorDraft | null {
  if (rows.plan.step === undefined) return null

  const step = APP_STEPS.includes(rows.plan.step as AppStep)
    ? (rows.plan.step as AppStep)
    : "review-subgoals"
  const language = LANGUAGES.includes(rows.plan.language as Language)
    ? (rows.plan.language as Language)
    : "en"

  const subgoals: EditorCell[] = [...rows.subgoals]
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      id: row.id,
      content: row.content,
      metric: null,
      isConfirmed: row.confirmed === true,
      isEditing: false,
    }))

  const known = new Set(subgoals.map((s) => s.id))
  const actions: Record<string, EditorCell[]> = {}
  for (const row of [...rows.actions].sort((a, b) => a.position - b.position)) {
    if (!known.has(row.subgoal_id)) continue
    ;(actions[row.subgoal_id] ??= []).push({
      id: row.id,
      content: row.content,
      metric: row.metric,
      isConfirmed: row.confirmed === true,
      isEditing: false,
    })
  }

  const actionIds = new Set(Object.values(actions).flat().map((a) => a.id))
  const dependencies: ActionDependency[] = rows.dependencies
    .filter((d) => actionIds.has(d.action_id) && actionIds.has(d.depends_on_id))
    .map((d) => ({
      actionId: d.action_id,
      dependsOnId: d.depends_on_id,
      rationale: d.rationale ?? "",
      confidence: d.confidence,
      userEdited: d.user_edited,
    }))

  const updatedAt = rows.plan.last_activity_at ?? rows.plan.updated_at
  return {
    id: rows.plan.id,
    mainGoal: rows.plan.main_goal,
    language,
    step,
    subgoals,
    actions,
    dependencies,
    createdAt: rows.plan.created_at,
    updatedAt,
    pendingSync: false,
    serverSyncedAt: updatedAt,
  }
}

// ---------------------------------------------------------------------------
// Which copy to open
// ---------------------------------------------------------------------------

export type InitialDraft =
  | { source: "server"; draft: EditorDraft }
  /** `push`: the local copy holds something the server does not have yet. */
  | { source: "local"; draft: EditorDraft; push: boolean }
  | { source: "none" }

/**
 * Picks the copy to show when a plan is opened.
 *
 * Deliberately never compares timestamps across machines: `updatedAt` in the
 * browser comes from the browser's clock and the server's from the database's,
 * and a laptop clock a few minutes fast would let a stale local copy overwrite
 * newer work. The local copy wins only when it says it has unsaved changes.
 */
export function chooseInitialDraft(
  local: EditorDraft | null,
  server: EditorDraft | null,
): InitialDraft {
  if (!server) return local ? { source: "local", draft: local, push: false } : { source: "none" }

  const serverEmpty = server.subgoals.length === 0
  if (!local) return serverEmpty ? { source: "none" } : { source: "server", draft: server }

  // A plan row created before its content was ever saved — the account's first
  // copy of a plan that so far exists only here.
  if (serverEmpty && local.subgoals.length > 0) {
    return { source: "local", draft: local, push: true }
  }
  if (local.pendingSync === true) return { source: "local", draft: local, push: true }
  return { source: "server", draft: server }
}
