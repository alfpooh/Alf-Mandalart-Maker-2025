import { getSession } from "@/lib/plans"
import { HomeScreen } from "@/components/home-screen"

/**
 * Entry screen. Server component so the session is known before first paint —
 * a sign-in button that flickers in after hydration reads as broken.
 */
export default async function HomePage() {
  const session = await getSession()
  return <HomeScreen session={session} />
}
