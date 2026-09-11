/**
 * Normalises a server action result that never arrived.
 *
 * Every branch of these actions returns an object, so `undefined` cannot come
 * out of their own code — it comes from the call itself. A loaded page holds
 * the action ids it was built with, and a deploy replaces them; anyone who had
 * the app open when it shipped then posts an id the new server does not answer,
 * and the promise resolves to nothing.
 *
 * Reading `.ok` off that threw an unhandled TypeError and blanked the screen,
 * where the person should simply have been told to reload. Cheap to guard, and
 * it happens on every deploy rather than rarely.
 */

export type Failed = { ok: false; error: string }

export function settle<T extends { ok: boolean }>(result: T | undefined): T | Failed {
  return result ?? { ok: false, error: "app.stale" }
}

/**
 * The same guard, for a call that rejects rather than returning nothing.
 *
 * `settle` covers a server action whose response never arrived; this covers one
 * whose fetch threw — a dropped connection, a suspended tab, a server restart.
 * Both had to be covered, because these calls are made inside `Promise.all`:
 * one rejection there abandons the whole batch, and a plan left mid-generation
 * has no way forward and no way back.
 */
export async function settled<T extends { ok: boolean }>(
  call: Promise<T | undefined>,
): Promise<T | Failed> {
  try {
    return settle(await call)
  } catch (error) {
    console.error("[action] call failed", error)
    return { ok: false, error: "app.offline" }
  }
}
