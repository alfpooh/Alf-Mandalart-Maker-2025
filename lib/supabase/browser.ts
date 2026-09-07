"use client"

import { createBrowserClient } from "@supabase/ssr"

import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config"
import type { Database } from "./types"

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null

/**
 * Browser client, or null when Supabase is not configured.
 *
 * Callers branch on null rather than getting a client that fails on first use —
 * "accounts are unavailable" is a state the UI can render; a rejected promise
 * from a half-built client is not.
 */
export function getBrowserClient() {
  if (!isSupabaseConfigured()) return null
  if (!cached) {
    cached = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return cached
}
