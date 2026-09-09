"use server"

import { randomUUID } from "node:crypto"
import { headers } from "next/headers"

import { clientIp, fingerprint, today, verdict, type QuotaVerdict } from "./quota"
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

/**
 * Writes a draft's subgoals and actions, replacing what is there.
 *
 * Called when the user finishes reviewing, not on every keystroke — the browser
 * copy already covers the between-steps case, and rewriting 72 rows per edit
 * would be wasteful.
 */
export async function savePlanContent(
  planId: string,
  draftToken: string | null,
  draft: EditorDraft,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = draftToken ? getAdminClient() : await getServerClient()
  if (!supabase) return { ok: true }

  // Ownership is proved by the token for a draft, and by RLS for an account.
  if (draftToken) {
    const { data } = await supabase
      .from("plans")
      .select("id")
      .eq("id", planId)
      .eq("draft_token", draftToken)
      .maybeSingle()
    if (!data) return { ok: false, error: "plan.notFound" }
  }

  await supabase.from("subgoals").delete().eq("plan_id", planId)

  const { data: inserted, error: subgoalError } = await supabase
    .from("subgoals")
    .insert(
      draft.subgoals.map((subgoal, position) => ({
        plan_id: planId,
        position,
        content: subgoal.content,
      })),
    )
    .select("id, position")

  if (subgoalError || !inserted) return { ok: false, error: "plan.saveFailed" }

  const byPosition = new Map(inserted.map((row) => [row.position, row.id]))
  const actions = draft.subgoals.flatMap((subgoal, position) => {
    const rowId = byPosition.get(position)
    if (!rowId) return []
    return (draft.actions[subgoal.id] ?? []).map((action, index) => ({
      plan_id: planId,
      subgoal_id: rowId,
      position: index,
      content: action.content,
      metric: action.metric,
    }))
  })

  if (actions.length > 0) {
    const { error } = await supabase.from("actions").insert(actions)
    if (error) return { ok: false, error: "plan.saveFailed" }
  }

  await supabase.from("plans").update({ main_goal: draft.mainGoal }).eq("id", planId)
  return { ok: true }
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
