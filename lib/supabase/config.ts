/**
 * Whether Supabase is wired up, and the values to wire it with.
 *
 * The app is expected to run without it. Until a project exists, plans live in
 * the browser and accounts are simply unavailable — every caller checks these
 * flags rather than assuming a client can be built, so a missing env var
 * degrades the feature instead of crashing the page.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

/** True when the browser and server clients can be built (auth, reads, writes). */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0
}

/**
 * True when the server can act with the service role.
 *
 * Needed for the two things a row-level policy cannot express: reading an
 * anonymous draft by its token, and counting generations per IP. Server-only —
 * this key must never be sent to a browser.
 */
export function hasServiceRole(): boolean {
  return isSupabaseConfigured() && (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").length > 0
}

/**
 * Anonymous visitors get this many Mandalarts per day.
 *
 * Two rather than one: the first is often spent learning what the tool does,
 * and someone who has to wait a day to try a real goal mostly does not come
 * back. A plan is roughly seventeen model calls, so this is still the main
 * thing standing between the app and an open bill.
 */
export const ANON_DAILY_LIMIT = Number(process.env.ANON_DAILY_LIMIT ?? "2")

/** Signed-in accounts. Generous, but not unbounded — one plan is ~17 AI calls. */
export const USER_DAILY_LIMIT = Number(process.env.USER_DAILY_LIMIT ?? "10")

/** How long an unclaimed anonymous draft survives. */
export const DRAFT_TTL_HOURS = 24
