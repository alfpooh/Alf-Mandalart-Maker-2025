import { getSession, loadPlan } from "@/lib/plans"
import { PlanEditor } from "@/components/plan-editor"

/**
 * Server component so the session is resolved before first paint — the teaser
 * only runs for people without an account, and deciding that after hydration
 * would flash it at everyone.
 *
 * For a signed-in user the account's copy is read here too, so opening a plan
 * on a new device shows it straight away instead of "not found" because this
 * browser has never seen it.
 */
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  const initial = session.signedIn ? await loadPlan(id) : null
  return <PlanEditor session={session} initial={initial} />
}
