import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

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
export function getServerClient() {
  if (!isSupabaseConfigured()) return null
  const store = cookies()

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

/** The signed-in user, or null. */
export async function getCurrentUser() {
  const supabase = getServerClient()
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
}
