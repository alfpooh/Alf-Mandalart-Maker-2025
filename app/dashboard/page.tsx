import { redirect } from "next/navigation"

import { DashboardScreen } from "@/components/dashboard/dashboard-screen"
import { listPlanSummaries } from "@/lib/dashboard"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { getAuthState } from "@/lib/supabase/server"

/**
 * Every Mandalart the signed-in person has.
 *
 * Checked here on the server, not by hiding a link. Someone signed out — often
 * a session that ended while the page stayed open, so the header still offered
 * this link — is sent to the start with a note saying why. The redirect used
 * to be silent, and from the start page the click looked like it did nothing.
 * When sign-in could not be checked at all, the dashboard says it could not
 * load rather than treating the person as signed out.
 */
export default async function DashboardPage() {
  if (!isSupabaseConfigured()) redirect("/")
  const auth = await getAuthState()
  if (auth.status === "signed-out") redirect("/?auth=required")
  if (auth.status === "unreachable") {
    return <DashboardScreen initial={{ status: "unavailable", reason: "error" }} />
  }
  return <DashboardScreen initial={await listPlanSummaries()} />
}
