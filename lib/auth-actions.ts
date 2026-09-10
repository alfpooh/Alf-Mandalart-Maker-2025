"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { baseUrlFrom } from "./base-url"
import { getServerClient } from "./supabase/server"

/**
 * Starts the Google sign-in redirect.
 *
 * Returns void so it can be used directly as a form action; failures come back
 * as a query parameter on the home page rather than a value, since a redirect
 * ends the request either way.
 */
export async function signInWithGoogle(): Promise<void> {
  const supabase = await getServerClient()
  if (!supabase) redirect("/?auth=unconfigured")

  const base = baseUrlFrom(await headers())
  // Better to refuse than to send someone to a host we invented.
  if (!base) redirect("/?auth=failed")

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${base}/auth/callback` },
  })

  if (error || !data.url) redirect("/?auth=failed")
  redirect(data.url)
}

export async function signOut(): Promise<void> {
  const supabase = await getServerClient()
  if (supabase) await supabase.auth.signOut()
  redirect("/")
}
