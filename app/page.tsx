import { getSession } from "@/lib/plans"
import { HomeScreen } from "@/components/home-screen"

/** Why someone was sent here (`?auth=`), as the message to show them. */
const AUTH_NOTICES: Record<string, string> = {
  required: "auth.expired",
  failed: "auth.failed",
  missing_code: "auth.failed",
  unconfigured: "auth.unconfigured",
}

/**
 * Entry screen. Server component so the session is known before first paint —
 * a sign-in button that flickers in after hydration reads as broken.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [session, params] = await Promise.all([getSession(), searchParams])
  const reason = typeof params.auth === "string" ? params.auth : null
  const authNotice = reason && Object.hasOwn(AUTH_NOTICES, reason) ? AUTH_NOTICES[reason] : null
  return <HomeScreen session={session} authNotice={authNotice} />
}
