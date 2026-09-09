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
