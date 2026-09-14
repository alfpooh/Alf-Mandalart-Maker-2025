"use server"

/**
 * Reading every plan an account holds, and the changes the dashboard makes to
 * whole plans: rename, archive, complete, pin, duplicate, delete, and saving
 * drafts that so far live only in this browser.
 *
 * Everything runs through the request's own client, so row level security
 * decides whose rows these are. `owner_id` is still filtered on explicitly: a
 * publicly shared plan is readable by anyone, and "my Mandalarts" must not list
 * someone else's. Updates ask for the changed rows back, because a policy that
 * filters a row out reports success with nothing changed.
 */

import { randomUUID } from "node:crypto"

import { draftToPayload, isUuid, type PayloadProblem } from "./plan-sync"
import {
  cleanGoalName,
  confirmsGoal,
  duplicateDraft,
  summarizeAll,
  type ActionRow,
  type PlanRow,
  type PlanSummary,
  type SubgoalRow,
} from "./plan-summary"
import { checkQuota, loadPlan, savePlan } from "./plans"
import type { QuotaVerdict } from "./quota"
import { isSupabaseConfigured } from "./supabase/config"
import { getAdminClient, getCurrentUser, getServerClient } from "./supabase/server"
import type { EditorDraft } from "./types"

export type DashboardData =
  | { status: "ok"; plans: PlanSummary[]; quota: QuotaVerdict }
  | { status: "unavailable"; reason: "unconfigured" | "signed-out" | "schema-outdated" | "error" }

export type ManageResult = { ok: true } | { ok: false; error: string }

export type CreatedResult =
  | { ok: true; planId: string; savedAt: string }
  | { ok: false; error: string; reason?: PayloadProblem }

type DbError = { code: string; message: string }

const SCHEMA_OUTDATED = new Set(["PGRST202", "42883", "42703"])

const PLAN_COLUMNS =
  "id, main_goal, language, status, step, pinned, created_at, updated_at, last_activity_at, completed_at, archived_at"

/** Plans per request, and plan ids per child-table query (keeps the URL short). */
const PLAN_PAGE = 100
/** Supabase caps a response at 1000 rows by default; ask for no more than that. */
const ROW_PAGE = 1000
/** Far beyond any real account. Stops a runaway loop; limits nobody. */
const MAX_PLANS = 2000
/** One bulk action at most. */
const MAX_BULK = 500

async function signedIn() {
  const supabase = await getServerClient()
  if (!supabase) return null
  const user = await getCurrentUser()
  return user ? { supabase, user } : null
}

type Context = NonNullable<Awaited<ReturnType<typeof signedIn>>>

function failed(context: string, error: DbError): { ok: false; error: string } {
  console.error(`[dashboard] ${context} failed:`, error.code, error.message)
  return {
    ok: false,
    error: SCHEMA_OUTDATED.has(error.code) ? "plan.schemaOutdated" : "dashboard.error.failed",
  }
}

/** The rows an update touched must be exactly the ones asked for. */
function touched(
  context: string,
  result: { data: { id: string }[] | null; error: DbError | null },
  expected: number,
): ManageResult {
  if (result.error) return failed(context, result.error)
  return (result.data?.length ?? 0) === expected ? { ok: true } : { ok: false, error: "plan.missing" }
}

function validIds(ids: unknown): ids is string[] {
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= MAX_BULK &&
    ids.every(isUuid) &&
    new Set(ids).size === ids.length
  )
}

const now = () => new Date().toISOString()

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Every page of a query. A query builder runs once, so each page builds its own. */
async function everyRow<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: DbError | null }>,
  pageSize: number,
  cap = Number.POSITIVE_INFINITY,
): Promise<{ rows: T[]; error: DbError | null }> {
  const rows: T[] = []
  for (let from = 0; from < cap; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { rows, error }
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  return { rows, error: null }
}

function unavailable(error: DbError): DashboardData {
  console.error("[dashboard] list failed:", error.code, error.message)
  return {
    status: "unavailable",
    reason: SCHEMA_OUTDATED.has(error.code) ? "schema-outdated" : "error",
  }
}

/**
 * Every plan this account owns, as dashboard cards, with today's quota.
 *
 * Read in pages rather than one request: the plan list is paged by
 * `last_activity_at` (indexed with the owner), and each plan's subgoals and
 * actions come in pages of at most 1000 rows, the most a response returns.
 */
export async function listPlanSummaries(): Promise<DashboardData> {
  if (!isSupabaseConfigured()) return { status: "unavailable", reason: "unconfigured" }
  const ctx = await signedIn()
  if (!ctx) return { status: "unavailable", reason: "signed-out" }
  const { supabase, user } = ctx

  const plans = await everyRow<PlanRow>(
    (from, to) =>
      supabase
        .from("plans")
        .select(PLAN_COLUMNS)
        .eq("owner_id", user.id)
        .order("last_activity_at", { ascending: false })
        .order("id")
        .range(from, to),
    PLAN_PAGE,
    MAX_PLANS,
  )
  if (plans.error) return unavailable(plans.error)

  const subgoals: SubgoalRow[] = []
  const actions: ActionRow[] = []
  const ids = plans.rows.map((plan) => plan.id)
  for (let i = 0; i < ids.length; i += PLAN_PAGE) {
    const chunk = ids.slice(i, i + PLAN_PAGE)
    const [subgoalRows, actionRows] = await Promise.all([
      everyRow<SubgoalRow>(
        (from, to) =>
          supabase
            .from("subgoals")
            .select("id, plan_id, position")
            .in("plan_id", chunk)
            .order("id")
            .range(from, to),
        ROW_PAGE,
      ),
      everyRow<ActionRow>(
        (from, to) =>
          supabase
            .from("actions")
            .select("plan_id, subgoal_id, progress")
            .in("plan_id", chunk)
            .order("id")
            .range(from, to),
        ROW_PAGE,
      ),
    ])
    const error = subgoalRows.error ?? actionRows.error
    if (error) return unavailable(error)
    subgoals.push(...subgoalRows.rows)
    actions.push(...actionRows.rows)
  }

  return {
    status: "ok",
    plans: summarizeAll(plans.rows, subgoals, actions),
    quota: await checkQuota(),
  }
}

/** Progress reports that deleting this plan would destroy, so the dialog can say how many. */
export async function countPlanReports(
  planId: string,
): Promise<{ ok: true; reports: number } | { ok: false; error: string }> {
  if (!isUuid(planId)) return { ok: false, error: "plan.missing" }
  const ctx = await signedIn()
  if (!ctx) return { ok: false, error: "auth.required" }

  const { count, error } = await ctx.supabase
    .from("progress_logs")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId)
  if (error) return failed("count reports", error)
  return { ok: true, reports: count ?? 0 }
}

// ---------------------------------------------------------------------------
// Changing one plan
// ---------------------------------------------------------------------------

/** Renaming is editing the plan, so it counts as activity. */
export async function renamePlan(planId: string, mainGoal: string): Promise<ManageResult> {
  const name = cleanGoalName(typeof mainGoal === "string" ? mainGoal : "")
  if (!name) return { ok: false, error: "dashboard.error.nameInvalid" }
  if (!isUuid(planId)) return { ok: false, error: "plan.missing" }
  const ctx = await signedIn()
  if (!ctx) return { ok: false, error: "auth.required" }

  const result = await ctx.supabase
    .from("plans")
    .update({ main_goal: name, last_activity_at: now() })
    .eq("id", planId)
    .eq("owner_id", ctx.user.id)
    .select("id")
  return touched("rename", result, 1)
}

/** Completion is a person's call (PRD D8), never inferred from progress. */
export async function setPlanCompleted(planId: string, completed: boolean): Promise<ManageResult> {
  if (!isUuid(planId)) return { ok: false, error: "plan.missing" }
  const ctx = await signedIn()
  if (!ctx) return { ok: false, error: "auth.required" }

  const patch: { status: string; completed_at: string | null } = completed
    ? { status: "completed", completed_at: now() }
    : { status: "active", completed_at: null }

  const result = await ctx.supabase
    .from("plans")
    .update(patch)
    .eq("id", planId)
    .eq("owner_id", ctx.user.id)
    // An archived plan is restored first; completing it in the archive would
    // leave its status and its archived_at disagreeing.
    .is("archived_at", null)
    .select("id")
  return touched(completed ? "complete" : "reopen", result, 1)
}

export async function setPlanPinned(planId: string, pinned: boolean): Promise<ManageResult> {
  if (!isUuid(planId)) return { ok: false, error: "plan.missing" }
  const ctx = await signedIn()
  if (!ctx) return { ok: false, error: "auth.required" }

  const result = await ctx.supabase
    .from("plans")
    .update({ pinned: pinned === true })
    .eq("id", planId)
    .eq("owner_id", ctx.user.id)
    .select("id")
  return touched("pin", result, 1)
}

/**
 * Permanently deletes a plan and, through the foreign keys, everything in it.
 *
 * The typed goal is checked here as well as in the dialog: the dialog's check
 * is a convenience, this one is the rule.
 */
export async function deletePlan(planId: string, typedGoal: string): Promise<ManageResult> {
  if (!isUuid(planId)) return { ok: false, error: "plan.missing" }
  const ctx = await signedIn()
  if (!ctx) return { ok: false, error: "auth.required" }

  const { data: plan, error } = await ctx.supabase
    .from("plans")
    .select("main_goal")
    .eq("id", planId)
    .eq("owner_id", ctx.user.id)
    .maybeSingle()
  if (error) return failed("delete", error)
  if (!plan) return { ok: false, error: "plan.missing" }
  if (!confirmsGoal(typeof typedGoal === "string" ? typedGoal : "", plan.main_goal)) {
    return { ok: false, error: "dashboard.error.confirmMismatch" }
  }

  const result = await ctx.supabase
    .from("plans")
    .delete()
    .eq("id", planId)
    .eq("owner_id", ctx.user.id)
    .select("id")
  return touched("delete", result, 1)
}

// ---------------------------------------------------------------------------
// Changing many plans
// ---------------------------------------------------------------------------

/**
 * Archives, or restores, a set of plans.
 *
 * Restoring puts each plan back where it was: one completed before it was
 * archived comes back completed, not in progress.
 */
export async function setPlansArchived(planIds: string[], archived: boolean): Promise<ManageResult> {
  if (!validIds(planIds)) return { ok: false, error: "dashboard.error.failed" }
  const ctx = await signedIn()
  if (!ctx) return { ok: false, error: "auth.required" }
  const { supabase, user } = ctx

  if (archived) {
    const result = await supabase
      .from("plans")
      .update({ status: "archived", archived_at: now() })
      .in("id", planIds)
      .eq("owner_id", user.id)
      .select("id")
    return touched("archive", result, planIds.length)
  }

  const [wasCompleted, wasOpen] = await Promise.all([
    supabase
      .from("plans")
      .update({ status: "completed", archived_at: null })
      .in("id", planIds)
      .eq("owner_id", user.id)
      .not("completed_at", "is", null)
      .select("id"),
    supabase
      .from("plans")
      .update({ status: "active", archived_at: null })
      .in("id", planIds)
      .eq("owner_id", user.id)
      .is("completed_at", null)
      .select("id"),
  ])
  if (wasCompleted.error) return failed("restore", wasCompleted.error)
  if (wasOpen.error) return failed("restore", wasOpen.error)
  const restored = (wasCompleted.data?.length ?? 0) + (wasOpen.data?.length ?? 0)
  return restored === planIds.length ? { ok: true } : { ok: false, error: "plan.missing" }
}

// ---------------------------------------------------------------------------
// Creating plans from existing content
// ---------------------------------------------------------------------------

/**
 * Creates the plan row and writes its content, as one outcome.
 *
 * A row whose content failed to save would show as an empty card, so it is
 * removed again. Neither path calls a model, so neither spends quota.
 */
async function insertWithContent(
  ctx: Context,
  draft: EditorDraft,
): Promise<CreatedResult | { ok: false; error: string; conflict: true }> {
  const built = draftToPayload(draft)
  if (!built.ok) return { ok: false, error: "plan.notSynced", reason: built.reason }

  const inserted = await ctx.supabase.from("plans").insert({
    id: draft.id,
    owner_id: ctx.user.id,
    main_goal: built.payload.mainGoal,
    language: built.payload.language,
    status: "active",
    step: built.payload.step,
  })
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return { ok: false, error: "dashboard.error.failed", conflict: true }
    }
    return failed("create", inserted.error)
  }

  const saved = await ctx.supabase.rpc("save_plan_content", {
    p_plan_id: draft.id,
    p_payload: built.payload,
  })
  if (saved.error) {
    await ctx.supabase.from("plans").delete().eq("id", draft.id).eq("owner_id", ctx.user.id)
    return failed("save content", saved.error)
  }
  return { ok: true, planId: draft.id, savedAt: String(saved.data) }
}

/** A new plan with the same subgoals and actions. Progress and reports stay behind. */
export async function duplicatePlan(planId: string, mainGoal: string): Promise<CreatedResult> {
  const name = cleanGoalName(typeof mainGoal === "string" ? mainGoal : "")
  if (!name) return { ok: false, error: "dashboard.error.nameInvalid" }
  if (!isUuid(planId)) return { ok: false, error: "plan.missing" }
  const ctx = await signedIn()
  if (!ctx) return { ok: false, error: "auth.required" }

  // loadPlan also reads publicly shared plans; only this account's own are copied here.
  const own = await ctx.supabase
    .from("plans")
    .select("id")
    .eq("id", planId)
    .eq("owner_id", ctx.user.id)
    .maybeSingle()
  if (own.error) return failed("duplicate", own.error)
  if (!own.data) return { ok: false, error: "plan.missing" }

  const loaded = await loadPlan(planId)
  if (loaded.status !== "loaded") return { ok: false, error: "dashboard.error.failed" }
  if (loaded.draft.subgoals.length === 0) return { ok: false, error: "dashboard.error.noContent" }

  const copy = duplicateDraft(
    loaded.draft,
    { id: randomUUID(), mainGoal: name, now: now() },
    randomUUID,
  )
  return insertWithContent(ctx, copy)
}

/**
 * Saves a draft that exists only in this browser to the account.
 *
 * Keeps the draft's id when it can. When the id is taken, the usual cause is
 * an anonymous draft row whose token this browser no longer holds — starting a
 * second draft replaces the first one's token — and that row expires on its
 * own, so the plan is saved under a new id. A row that belongs to an account
 * is a different matter: that is someone else's plan, left in this browser by
 * an earlier sign-in, and it is not this person's to copy.
 */
export async function importLocalDraft(draft: EditorDraft): Promise<CreatedResult> {
  const ctx = await signedIn()
  if (!ctx) return { ok: false, error: "auth.required" }
  if (!draft || !isUuid(draft.id)) {
    return { ok: false, error: "plan.notSynced", reason: "not-server-plan" }
  }

  const first = await insertWithContent(ctx, draft)
  if (first.ok || !("conflict" in first)) return first

  // Who holds the id cannot be read through row level security, which hides
  // exactly the rows in question.
  const admin = getAdminClient()
  if (!admin) return { ok: false, error: "dashboard.error.failed" }
  const { data: existing, error } = await admin
    .from("plans")
    .select("owner_id")
    .eq("id", draft.id)
    .maybeSingle()
  if (error) return failed("import", error)

  if (existing?.owner_id === ctx.user.id) {
    // Already this account's plan — it arrived between listing and saving.
    const saved = await savePlan(draft)
    return saved.ok
      ? { ok: true, planId: draft.id, savedAt: saved.savedAt }
      : { ok: false, error: saved.error, reason: saved.reason }
  }
  if (existing?.owner_id) return { ok: false, error: "dashboard.error.otherAccount" }

  const retry = await insertWithContent(ctx, { ...draft, id: randomUUID() })
  return retry.ok || !("conflict" in retry) ? retry : { ok: false, error: "dashboard.error.failed" }
}
