"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

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

  const headerList = await headers()
  const origin = headerList.get("origin") ?? headerList.get("x-forwarded-host")
  const base = origin?.startsWith("http") ? origin : `https://${origin}`

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
