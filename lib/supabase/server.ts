import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { isAuthRetryableFetchError, isAuthSessionMissingError, type User } from "@supabase/supabase-js"

import {
  hasServiceRole,
  isSupabaseConfigured,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "./config"
import type { Database } from "./types"

/**
 * Server client bound to the request's cookies, or null when unconfigured.
 *
 * Row level security applies, so this only ever sees the signed-in user's own
 * rows — which is what we want everywhere except the two places that need the
 * service role.
 */
export async function getServerClient() {
  if (!isSupabaseConfigured()) return null
  // Async since Next 15: cookies() returns a promise, which makes every
  // caller of this factory async too.
  const store = await cookies()

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options)
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  })
}

/**
 * Service-role client. Bypasses row level security — server only.
 *
 * Exists for the two things a policy cannot express: reading an anonymous draft
 * by its bearer token (a policy cannot verify a token), and counting
 * generations per IP (the row belongs to nobody). Never import this from a
 * client component.
 */
export function getAdminClient() {
  if (!hasServiceRole()) return null

  return createServerClient<Database>(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}

/**
 * Whether this request is signed in — and, unlike a bare null, whether that
 * could be checked at all.
 *
 * Any failed call to Supabase Auth used to read as "signed out", so a brief
 * network error sent someone who was signed in back to the start page without
 * a word. Why a session was not accepted is logged — error name, status and
 * code only, never a token — so the next report can be traced.
 */
export type AuthState =
  | { status: "signed-in"; user: User }
  | { status: "signed-out" }
  | { status: "unreachable" }

export async function getAuthState(): Promise<AuthState> {
  const supabase = await getServerClient()
  if (!supabase) return { status: "signed-out" }
  const { data, error } = await supabase.auth.getUser()
  if (!error && data.user) return { status: "signed-in", user: data.user }
  if (error && isAuthRetryableFetchError(error)) {
    console.warn("[auth] could not reach Supabase Auth:", error.name, error.status)
    return { status: "unreachable" }
  }
  if (error && !isAuthSessionMissingError(error)) {
    console.warn("[auth] session not accepted:", error.name, error.status, error.code ?? "")
  }
  return { status: "signed-out" }
}

/** The signed-in user, or null — also when sign-in could not be checked. */
export async function getCurrentUser() {
  const auth = await getAuthState()
  return auth.status === "signed-in" ? auth.user : null
}
