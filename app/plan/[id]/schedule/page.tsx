import { redirect } from "next/navigation"

import { PlanningScreen } from "@/components/planning/planning-screen"
import { loadPlanSchedule } from "@/lib/plan-schedule"
import { getSession } from "@/lib/plans"

/**
 * Turning a finished Mandalart into work: the to-do list first (PRD §12.1).
 *
 * Planning lives in the account, so someone without one is sent back to the
 * plan itself, where the editor offers signing in.
 */
export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session.configured || !session.signedIn) redirect(`/plan/${id}`)
  return <PlanningScreen planId={id} initial={await loadPlanSchedule(id)} />
}
