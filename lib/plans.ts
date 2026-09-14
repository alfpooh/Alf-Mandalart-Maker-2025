"use server"

import { randomUUID } from "node:crypto"
import { headers } from "next/headers"

import { clientIp, fingerprint, today, verdict, type QuotaVerdict } from "./quota"
import { draftToPayload, isUuid, rowsToDraft, type PayloadProblem } from "./plan-sync"
import { getAdminClient, getCurrentUser, getServerClient } from "./supabase/server"
import {
  ANON_DAILY_LIMIT,
  DRAFT_TTL_HOURS,
  hasServiceRole,
  isSupabaseConfigured,
  USER_DAILY_LIMIT,
} from "./supabase/config"
import type { EditorDraft, Language } from "./types"

export interface SessionInfo {
  configured: boolean
  signedIn: boolean
  email: string | null
  displayName: string | null
}

/** Who is here, and whether accounts exist at all in this deployment. */
export async function getSession(): Promise<SessionInfo> {
  if (!isSupabaseConfigured()) {
    return { configured: false, signedIn: false, email: null, displayName: null }
  }
  const user = await getCurrentUser()
  return {
    configured: true,
    signedIn: user !== null,
    email: user?.email ?? null,
    displayName:
      (user?.user_metadata?.full_name as string | undefined) ??
      (user?.user_metadata?.name as string | undefined) ??
      null,
  }
}

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------

/**
 * How many generations are left today.
 *
 * Without a service-role key there is nowhere to count, so this allows the
 * request rather than blocking every visitor — a deployment with no Supabase
 * is the local-only mode, where there is no bill to protect. The limit becomes
 * real as soon as the key is present.
 */
export async function checkQuota(): Promise<QuotaVerdict> {
  const user = await getCurrentUser()
  const signedIn = user !== null
  const admin = getAdminClient()

  if (!admin) {
    return { allowed: true, used: 0, limit: signedIn ? USER_DAILY_LIMIT : ANON_DAILY_LIMIT }
  }

  const key = await quotaKey(user?.id ?? null)
  if (!key) {
    // No usable IP and no account: cannot attribute the request, so let it
    // through rather than locking out everyone behind an unusual proxy.
    return { allowed: true, used: 0, limit: ANON_DAILY_LIMIT }
  }

  const { data } = await admin
    .from("anon_quota")
    .select("count")
    .eq("fingerprint", key)
    .eq("day", today())
    .maybeSingle()

  return verdict(data?.count ?? 0, signedIn)
}

/** Records one generation. Called only after the plan was actually created. */
export async function consumeQuota(): Promise<void> {
  const admin = getAdminClient()
  if (!admin) return

  const user = await getCurrentUser()
  const key = await quotaKey(user?.id ?? null)
  if (!key) return

  const day = today()
  const { data } = await admin
    .from("anon_quota")
    .select("count")
    .eq("fingerprint", key)
    .eq("day", day)
    .maybeSingle()

  await admin
    .from("anon_quota")
    .upsert({ fingerprint: key, day, count: (data?.count ?? 0) + 1 })
}

/**
 * What the quota counts against: the account when signed in, otherwise a
 * salted hash of the IP.
 */
async function quotaKey(userId: string | null): Promise<string | null> {
  if (userId) return `user:${userId}`

  const salt = process.env.ANON_QUOTA_SALT
  if (!salt) {
    // Hashing without a salt would store a reversible value. Refuse instead.
    console.warn("[quota] ANON_QUOTA_SALT is unset; anonymous quota is not enforced")
    return null
  }

  const ip = clientIp(await headers())
  return ip ? fingerprint(ip, salt) : null
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export interface CreatedPlan {
  planId: string
  /** Present for anonymous drafts; the browser holds it to claim the plan later. */
  draftToken: string | null
}

export type CreateResult =
  | { ok: true; plan: CreatedPlan | null }
  | { ok: false; error: string; quota?: QuotaVerdict }

/**
 * Creates the plan row, after checking the quota.
 *
 * Returns `plan: null` when Supabase is not configured — the caller then keeps
 * working from the browser alone, which is the local-only mode.
 */
export async function createPlan(
  mainGoal: string,
  language: Language,
): Promise<CreateResult> {
  const quota = await checkQuota()
  if (!quota.allowed) {
    return { ok: false, error: quota.reason ?? "quota.anonExhausted", quota }
  }

  if (!isSupabaseConfigured()) {
    await consumeQuota()
    return { ok: true, plan: null }
  }

  const supabase = await getServerClient()
  if (!supabase) return { ok: true, plan: null }

  const user = await getCurrentUser()

  if (user) {
    const { data, error } = await supabase
      .from("plans")
      .insert({ owner_id: user.id, main_goal: mainGoal, language, status: "active" })
      .select("id")
      .single()

    if (error || !data) return { ok: false, error: "plan.saveFailed" }
    await consumeQuota()
    return { ok: true, plan: { planId: data.id, draftToken: null } }
  }

  // Anonymous: needs the service role, since no policy grants anon an insert.
  const admin = getAdminClient()
  if (!admin) return { ok: true, plan: null }

  const draftToken = randomUUID()
  const expiresAt = new Date(Date.now() + DRAFT_TTL_HOURS * 3600_000).toISOString()

  const { data, error } = await admin
    .from("plans")
    .insert({
      main_goal: mainGoal,
      language,
      draft_token: draftToken,
      expires_at: expiresAt,
      status: "draft",
    })
    .select("id")
    .single()

  if (error || !data) return { ok: false, error: "plan.saveFailed" }
  await consumeQuota()
  return { ok: true, plan: { planId: data.id, draftToken } }
}

const SCHEMA_OUTDATED = new Set([
  "PGRST202", // PostgREST: function not in the schema cache
  "42883", // undefined_function
  "42703", // undefined_column
])

export type SaveResult =
  | { ok: true; savedAt: string }
  | {
      ok: false
      error:
        | "auth.required"
        | "plan.notSynced"
        | "plan.schemaOutdated"
        | "plan.missing"
        | "plan.saveFailed"
      /** Why a draft could not be saved yet, when that is the reason. */
      reason?: PayloadProblem
    }

/**
 * Saves a signed-in user's plan to their account.
 *
 * Replaces the previous save, which deleted every subgoal and inserted them
 * again. The child tables cascade, so each save would have erased every
 * action's progress and report history. `save_plan_content` keeps every row's
 * id and writes the whole plan in one transaction — see supabase/schema.sql.
 *
 * Anonymous drafts are not saved here; they stay in the browser until the
 * person signs in, and the claim page sends them then.
 */
export async function savePlan(draft: EditorDraft): Promise<SaveResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "auth.required" }

  // Checked on the server, which is the boundary — not only before sending.
  const built = draftToPayload(draft)
  if (!built.ok) return { ok: false, error: "plan.notSynced", reason: built.reason }

  const supabase = await getServerClient()
  if (!supabase) return { ok: false, error: "plan.saveFailed" }

  const { data, error } = await supabase.rpc("save_plan_content", {
    p_plan_id: draft.id,
    p_payload: built.payload,
  })

  if (error) {
    console.error("[plans] save_plan_content failed:", error.code, error.message)
    // The migration has not been applied to this database yet.
    if (SCHEMA_OUTDATED.has(error.code)) return { ok: false, error: "plan.schemaOutdated" }
    if (error.code === "P0002") return { ok: false, error: "plan.missing" }
    return { ok: false, error: "plan.saveFailed" }
  }
  return { ok: true, savedAt: String(data) }
}

export type LoadResult =
  | { status: "loaded"; draft: EditorDraft }
  /** No row this user can see — not theirs, never created, or deleted. */
  | { status: "empty" }
  | {
      status: "unavailable"
      reason: "not-server-plan" | "unconfigured" | "signed-out" | "schema-outdated" | "error"
    }

/**
 * A signed-in user's plan, read from their account.
 *
 * Row level security does the ownership check: a plan belonging to someone else
 * returns no row, which is reported exactly like one that does not exist.
 */
export async function loadPlan(planId: string): Promise<LoadResult> {
  if (!isUuid(planId)) return { status: "unavailable", reason: "not-server-plan" }
  if (!isSupabaseConfigured()) return { status: "unavailable", reason: "unconfigured" }

  const user = await getCurrentUser()
  if (!user) return { status: "unavailable", reason: "signed-out" }

  const supabase = await getServerClient()
  if (!supabase) return { status: "unavailable", reason: "unconfigured" }

  const { data: plan, error } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle()

  if (error) {
    console.error("[plans] load failed:", error.code, error.message)
    return { status: "unavailable", reason: "error" }
  }
  if (!plan) return { status: "empty" }

  const [subgoals, actions, dependencies] = await Promise.all([
    supabase.from("subgoals").select("*").eq("plan_id", planId),
    supabase.from("actions").select("*").eq("plan_id", planId),
    supabase.from("action_dependencies").select("*").eq("plan_id", planId),
  ])
  const failed = subgoals.error ?? actions.error ?? dependencies.error
  if (failed) {
    console.error("[plans] load failed:", failed.code, failed.message)
    return { status: "unavailable", reason: "error" }
  }

  const draft = rowsToDraft({
    plan,
    subgoals: subgoals.data ?? [],
    actions: actions.data ?? [],
    dependencies: dependencies.data ?? [],
  })
  if (!draft) return { status: "unavailable", reason: "schema-outdated" }
  return { status: "loaded", draft }
}

/**
 * Moves an anonymous draft onto the signed-in account.
 *
 * Runs in one statement inside `claim_draft()` — a claim that half-succeeded
 * would leave the plan owned by nobody and reachable by nobody, which for the
 * user means the Mandalart they just spent half an hour on is gone.
 */
export async function claimDraft(
  draftToken: string,
): Promise<{ ok: boolean; planId?: string; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "auth.required" }

  const admin = getAdminClient()
  if (!admin) return { ok: false, error: "plan.notFound" }

  const { data, error } = await admin.rpc("claim_draft", {
    token: draftToken,
    new_owner: user.id,
  })

  if (error) return { ok: false, error: "plan.claimFailed" }
  if (!data) return { ok: false, error: "plan.draftExpired" }
  return { ok: true, planId: data }
}
