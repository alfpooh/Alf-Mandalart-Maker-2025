import { redirect } from "next/navigation"

import { DashboardScreen } from "@/components/dashboard/dashboard-screen"
import { listPlanSummaries } from "@/lib/dashboard"
import { getSession } from "@/lib/plans"

/**
 * Every Mandalart the signed-in person has.
 *
 * Checked here on the server, not by hiding a link: someone who opens the
 * address without an account is sent to the start, where signing in is offered.
 */
export default async function DashboardPage() {
  const session = await getSession()
  if (!session.configured || !session.signedIn) redirect("/")
  return <DashboardScreen initial={await listPlanSummaries()} />
}
