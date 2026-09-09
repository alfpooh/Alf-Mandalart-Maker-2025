import { getSession } from "@/lib/plans"
import { PlanEditor } from "@/components/plan-editor"

/**
 * Server component so the session is resolved before first paint — the teaser
 * only runs for people without an account, and deciding that after hydration
 * would flash it at everyone.
 */
export default async function PlanPage() {
  const session = await getSession()
  return <PlanEditor session={session} />
}
