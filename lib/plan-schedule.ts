"use server"

/**
 * Reading and changing a plan's schedule, to-do order and completion.
 *
 * These are the columns `save_plan_content` never touches (PRD §12.1), so the
 * editor and the planning screen cannot overwrite each other's work there.
 * Prerequisite edges are the exception: the editor saves its whole edge set,
 * so a prerequisite changed here is also written into this browser's local
 * copy by the caller, or the next editor save would bring the old set back.
 *
 * Every query runs through the request's own client under row level security,
 * with `owner_id` filtered explicitly so a publicly shared plan never reads
 * as the viewer's own.
 */

import { isUuid } from "./plan-sync"
import {
  SCHEDULE_MODES,
  isTimeZone,
  validateChanges,
  wouldCreateCycle,
  type PlannedAction,
  type ScheduleMode,
} from "./schedule"
import { isSupabaseConfigured } from "./supabase/config"
import { getCurrentUser, getServerClient } from "./supabase/server"
import { LANGUAGES, isProgressValue, type ActionDependency, type Language } from "./types"

export interface PlanSchedule {
  planId: string
  mainGoal: string
  language: Language
  status: string
  step: string
  scheduleMode: ScheduleMode
  timeZone: string | null
  trackingStartedAt: string | null
  subgoals: { id: string; position: number; content: string }[]
  actions: PlannedAction[]
  dependencies: ActionDependency[]
}

export type ScheduleLoad =
  | { status: "loaded"; schedule: PlanSchedule }
  | { status: "unavailable"; reason: "unconfigured" | "signed-out" | "missing" | "schema-outdated" | "error" }

export type ScheduleResult = { ok: true; savedAt: string } | { ok: false; error: string; reason?: string }

type DbError = { code: string; message: string }

const SCHEMA_OUTDATED = new Set(["PGRST202", "42883", "42703"])

async function signedIn() {
  const supabase = await getServerClient()
  if (!supabase) return null
  const user = await getCurrentUser()
  return user ? { supabase, user } : null
}

function failed(context: string, error: DbError): { ok: false; error: string } {
  console.error(`[schedule] ${context} failed:`, error.code, error.message)
  if (SCHEMA_OUTDATED.has(error.code)) return { ok: false, error: "plan.schemaOutdated" }
  if (error.code === "P0002") return { ok: false, error: "plan.missing" }
  return { ok: false, error: "schedule.error.failed" }
}

const now = () => new Date().toISOString()

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** The plan as the planning screen needs it: every action with its dates, order and progress. */
export async function loadPlanSchedule(planId: string): Promise<ScheduleLoad> {
  if (!isSupabaseConfigured()) return { status: "unavailable", reason: "unconfigured" }
  if (!isUuid(planId)) return { status: "unavailable", reason: "missing" }
  const ctx = await signedIn()
  if (!ctx) return { status: "unavailable", reason: "signed-out" }
  const { supabase, user } = ctx

  const unavailable = (error: DbError): ScheduleLoad => {
    console.error("[schedule] load failed:", error.code, error.message)
    return { status: "unavailable", reason: SCHEMA_OUTDATED.has(error.code) ? "schema-outdated" : "error" }
  }

  const plan = await supabase
    .from("plans")
    .select("id, main_goal, language, status, step, schedule_mode, time_zone, tracking_started_at")
    .eq("id", planId)
    .eq("owner_id", user.id)
    .maybeSingle()
  if (plan.error) return unavailable(plan.error)
  if (!plan.data) return { status: "unavailable", reason: "missing" }

  const [subgoals, actions, dependencies] = await Promise.all([
    supabase.from("subgoals").select("id, position, content").eq("plan_id", planId).order("position"),
    supabase
      .from("actions")
      .select("id, subgoal_id, position, content, progress, start_date, estimate_days, due_date, date_locked, todo_rank, completed_at")
      .eq("plan_id", planId),
    supabase
      .from("action_dependencies")
      .select("action_id, depends_on_id, rationale, confidence, user_edited")
      .eq("plan_id", planId),
  ])
  const error = subgoals.error ?? actions.error ?? dependencies.error
  if (error) return unavailable(error)

  const areaOf = new Map((subgoals.data ?? []).map((s) => [s.id, s.position + 1]))
  const planned: PlannedAction[] = (actions.data ?? [])
    .filter((a) => areaOf.has(a.subgoal_id))
    .map((a) => ({
      id: a.id,
      subgoalId: a.subgoal_id,
      area: areaOf.get(a.subgoal_id)!,
      position: a.position,
      content: a.content,
      progress: isProgressValue(a.progress) ? a.progress : 0,
      startDate: a.start_date,
      estimateDays: a.estimate_days,
      dueDate: a.due_date,
      dateLocked: a.date_locked,
      todoRank: a.todo_rank,
      completedAt: a.completed_at,
    }))
    .sort((a, b) => a.area - b.area || a.position - b.position)

  const row = plan.data
  return {
    status: "loaded",
    schedule: {
      planId: row.id,
      mainGoal: row.main_goal,
      language: LANGUAGES.includes(row.language as Language) ? (row.language as Language) : "en",
      status: row.status,
      step: row.step,
      scheduleMode: SCHEDULE_MODES.includes(row.schedule_mode as ScheduleMode) ? (row.schedule_mode as ScheduleMode) : "calendar",
      timeZone: row.time_zone,
      trackingStartedAt: row.tracking_started_at,
      subgoals: subgoals.data ?? [],
      actions: planned,
      dependencies: (dependencies.data ?? []).map((d) => ({
        actionId: d.action_id,
        dependsOnId: d.depends_on_id,
        rationale: d.rationale ?? "",
        confidence: d.confidence,
        userEdited: d.user_edited,
      })),
    },
  }
}

// ---------------------------------------------------------------------------
// Changing actions
// ---------------------------------------------------------------------------

/**
 * Dates, estimates, locks, to-do ranks and progress for several actions, as
 * one change: a drag that also moves what follows, an applied schedule, a
 * reordered list. All of it lands or none of it does.
 */
export async function updatePlanActions(planId: string, changes: unknown): Promise<ScheduleResult> {
  if (!isUuid(planId)) return { ok: false, error: "plan.missing" }
  const checked = validateChanges(changes)
  if (!checked.ok) return { ok: false, error: "schedule.error.invalid", reason: checked.reason }
  const ctx = await signedIn()
  if (!ctx) return { ok: false, error: "auth.required" }

  const { data, error } = await ctx.supabase.rpc("update_plan_actions", {
    p_plan_id: planId,
    p_changes: checked.changes,
  })
  if (error) {
    if (error.code === "22023" || error.code === "23514") {
      console.error("[schedule] update refused:", error.code, error.message)
      return { ok: false, error: "schedule.error.invalid" }
    }
    return failed("update", error)
  }
  return { ok: true, savedAt: String(data) }
}

/** Calendar days or working days, and the time zone "today" is counted in (FR-2.5, 2.6). */
export async function setScheduleSettings(
  planId: string,
  settings: { mode?: ScheduleMode; timeZone?: string },
): Promise<ScheduleResult> {
  if (!isUuid(planId)) return { ok: false, error: "plan.missing" }
  const patch: { schedule_mode?: string; time_zone?: string; last_activity_at?: string } = {}
  if (settings.mode !== undefined) {
    if (!SCHEDULE_MODES.includes(settings.mode)) return { ok: false, error: "schedule.error.invalid" }
    patch.schedule_mode = settings.mode
  }
  if (settings.timeZone !== undefined) {
    if (!isTimeZone(settings.timeZone)) return { ok: false, error: "schedule.error.invalid" }
    patch.time_zone = settings.timeZone
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "schedule.error.invalid" }
  const ctx = await signedIn()
  if (!ctx) return { ok: false, error: "auth.required" }

  const savedAt = now()
  const { data, error } = await ctx.supabase
    .from("plans")
    .update({ ...patch, last_activity_at: savedAt })
    .eq("id", planId)
    .eq("owner_id", ctx.user.id)
    .select("id")
  if (error) return failed("settings", error)
  return data?.length === 1 ? { ok: true, savedAt } : { ok: false, error: "plan.missing" }
}

/**
 * Marks the moment a plan first moved into tracking, and the time zone its
 * days are counted in. Only fills blanks: opening the planning screen again
 * changes nothing.
 */
export async function startTracking(planId: string, timeZone: string): Promise<ScheduleResult> {
  if (!isUuid(planId)) return { ok: false, error: "plan.missing" }
  const ctx = await signedIn()
  if (!ctx) return { ok: false, error: "auth.required" }
  const savedAt = now()

  const started = await ctx.supabase
    .from("plans")
    .update({ tracking_started_at: savedAt })
    .eq("id", planId)
    .eq("owner_id", ctx.user.id)
    .is("tracking_started_at", null)
  if (started.error) return failed("start tracking", started.error)

  if (isTimeZone(timeZone)) {
    const zoned = await ctx.supabase
      .from("plans")
      .update({ time_zone: timeZone })
      .eq("id", planId)
      .eq("owner_id", ctx.user.id)
      .is("time_zone", null)
    if (zoned.error) return failed("time zone", zoned.error)
  }
  return { ok: true, savedAt }
}

// ---------------------------------------------------------------------------
// Prerequisites (FR-1.7)
// ---------------------------------------------------------------------------

/** Both actions must belong to this plan, and the plan to this person. */
async function planEdges(
  ctx: NonNullable<Awaited<ReturnType<typeof signedIn>>>,
  planId: string,
  actionIds: string[],
): Promise<{ ok: true; edges: ActionDependency[] } | { ok: false; error: string }> {
  const plan = await ctx.supabase.from("plans").select("id").eq("id", planId).eq("owner_id", ctx.user.id).maybeSingle()
  if (plan.error) return failed("prerequisite", plan.error)
  if (!plan.data) return { ok: false, error: "plan.missing" }

  const [actions, edges] = await Promise.all([
    ctx.supabase.from("actions").select("id").eq("plan_id", planId).in("id", actionIds),
    ctx.supabase.from("action_dependencies").select("action_id, depends_on_id").eq("plan_id", planId),
  ])
  const error = actions.error ?? edges.error
  if (error) return failed("prerequisite", error)
  if ((actions.data?.length ?? 0) !== new Set(actionIds).size) return { ok: false, error: "plan.missing" }

  return {
    ok: true,
    edges: (edges.data ?? []).map((e) => ({
      actionId: e.action_id,
      dependsOnId: e.depends_on_id,
      rationale: "",
      confidence: 1,
      userEdited: true,
    })),
  }
}

async function touchPlan(ctx: NonNullable<Awaited<ReturnType<typeof signedIn>>>, planId: string, savedAt: string) {
  await ctx.supabase.from("plans").update({ last_activity_at: savedAt }).eq("id", planId).eq("owner_id", ctx.user.id)
}

/** `actionId` waits on `dependsOnId`. Refused with a reason when it would close a loop. */
export async function addPrerequisite(planId: string, actionId: string, dependsOnId: string): Promise<ScheduleResult> {
  if (![planId, actionId, dependsOnId].every(isUuid)) return { ok: false, error: "schedule.error.invalid" }
  if (actionId === dependsOnId) return { ok: false, error: "schedule.error.cycle" }
  const ctx = await signedIn()
  if (!ctx) return { ok: false, error: "auth.required" }

  const loaded = await planEdges(ctx, planId, [actionId, dependsOnId])
  if (!loaded.ok) return loaded
  if (wouldCreateCycle(loaded.edges, actionId, dependsOnId)) return { ok: false, error: "schedule.error.cycle" }

  const { error } = await ctx.supabase.from("action_dependencies").insert({
    plan_id: planId,
    action_id: actionId,
    depends_on_id: dependsOnId,
    rationale: null,
    confidence: 1,
    // A person drew this edge; re-analysis must not drop it.
    user_edited: true,
  })
  // Already there is the outcome that was asked for.
  if (error && error.code !== "23505") return failed("add prerequisite", error)

  const savedAt = now()
  await touchPlan(ctx, planId, savedAt)
  return { ok: true, savedAt }
}

export async function removePrerequisite(planId: string, actionId: string, dependsOnId: string): Promise<ScheduleResult> {
  if (![planId, actionId, dependsOnId].every(isUuid)) return { ok: false, error: "schedule.error.invalid" }
  const ctx = await signedIn()
  if (!ctx) return { ok: false, error: "auth.required" }

  const loaded = await planEdges(ctx, planId, [actionId, dependsOnId])
  if (!loaded.ok) return loaded

  const { error } = await ctx.supabase
    .from("action_dependencies")
    .delete()
    .eq("plan_id", planId)
    .eq("action_id", actionId)
    .eq("depends_on_id", dependsOnId)
  if (error) return failed("remove prerequisite", error)

  const savedAt = now()
  await touchPlan(ctx, planId, savedAt)
  return { ok: true, savedAt }
}
