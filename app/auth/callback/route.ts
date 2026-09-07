import { NextResponse } from "next/server"

import { getServerClient } from "@/lib/supabase/server"

/**
 * Where Google sends the user back.
 *
 * Exchanges the code for a session, then hands off to /auth/claim, which is a
 * client page because the draft token it needs lives in the browser. Doing the
 * claim here would mean the token had to travel through the OAuth `state`
 * round trip, which is longer-lived and more exposed than localStorage.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const next = url.searchParams.get("next") ?? "/auth/claim"

  if (!code) {
    return NextResponse.redirect(new URL("/?auth=missing_code", url.origin))
  }

  const supabase = getServerClient()
  if (!supabase) {
    return NextResponse.redirect(new URL("/?auth=unconfigured", url.origin))
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL("/?auth=failed", url.origin))
  }

  // Only ever redirect within this site — an open redirect here would hand a
  // freshly minted session to whoever crafted the link.
  const target = next.startsWith("/") ? next : "/auth/claim"
  return NextResponse.redirect(new URL(target, url.origin))
}
