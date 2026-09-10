import { NextResponse } from "next/server"

import { baseUrlFrom } from "@/lib/base-url"
import { getServerClient } from "@/lib/supabase/server"

/**
 * Where Google sends the user back.
 *
 * Exchanges the code for a session, then hands off to /auth/claim, which is a
 * client page because the draft token it needs lives in the browser. Doing the
 * claim here would mean the token had to travel through the OAuth `state`
 * round trip, which is longer-lived and more exposed than localStorage.
 *
 * Every redirect below is built from the forwarded headers, not from
 * `request.url`. Behind a proxy that URL is the address the proxy dialled
 * internally — on Render that is localhost:10000 — so redirecting to its
 * origin sent the browser to a host only the server can reach. It surfaced as
 * ERR_SSL_PROTOCOL_ERROR at localhost right after the account picker, with the
 * sign-in already spent.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const next = url.searchParams.get("next") ?? "/auth/claim"

  // Query params come from request.url quite happily; only the origin is wrong.
  const base = baseUrlFrom(request.headers)
  if (!base) {
    // Nothing identifies this site, so there is nowhere safe to send anyone.
    return new NextResponse("Cannot determine site address", { status: 500 })
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?auth=missing_code", base))
  }

  const supabase = await getServerClient()
  if (!supabase) {
    return NextResponse.redirect(new URL("/?auth=unconfigured", base))
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL("/?auth=failed", base))
  }

  // Only ever redirect within this site — an open redirect here would hand a
  // freshly minted session to whoever crafted the link.
  const target = next.startsWith("/") ? next : "/auth/claim"
  return NextResponse.redirect(new URL(target, base))
}
