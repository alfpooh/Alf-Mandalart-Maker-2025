/**
 * One structured model call, with the retries, queue slot and failure
 * reporting every AI feature shares.
 *
 * Kept out of the "use server" modules on purpose: everything those export
 * becomes an endpoint a browser can call, and this takes any prompt.
 */

import { generateObject } from "ai"
import type { z } from "zod"

import { modelFor, providerOptionsFor, TASK_TIMEOUT_MS, type AiTask } from "./models"
import { withSlot } from "./queue"

/**
 * Every AI call returns this.
 *
 * The previous version manufactured placeholder text on failure and returned
 * `success: true`, so a broken generation looked identical to a good one. With
 * anonymous users limited to one Mandalart a day, that turns a transient API
 * error into a wasted day. Failures are now reported as failures.
 */
export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * True when a failure is worth another attempt with the same input.
 *
 * Every model tried here occasionally returns something that does not match
 * the schema — gpt-oss used to hand back the JSON Schema itself instead of
 * data matching it, and the provider marked that non-retryable, so the SDK
 * gave up. The very same request usually succeeds on the next try, so it is
 * retryable in practice. Rate limits land here too: on a free tier a plan's
 * calls outrun the per-minute allowance, and waiting is the fix, not failing.
 */
function isTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /schema|json_validate|does not match|empty|rate.?limit|429|5\d\d/i.test(message)
}

const MAX_ATTEMPTS = 3

export async function run<S extends z.ZodType>(
  task: AiTask,
  schema: S,
  prompt: string,
  ticketId: string,
): Promise<AiResult<z.infer<S>>> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Waiting for a slot happens per attempt, so a retry after a rate limit
      // goes to the back of the queue instead of jumping ahead of newcomers.
      const { object } = await withSlot(ticketId, () =>
        generateObject({
          model: modelFor(task),
          schema,
          prompt,
          providerOptions: providerOptionsFor(task),
          // Rate-limit rejections are retryable and the window is short; the
          // SDK's default of 2 gives up while the batch is still contending.
          maxRetries: 5,
          abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS[task]),
        }),
      )
      return { ok: true, data: object }
    } catch (error) {
      lastError = error
      if (attempt === MAX_ATTEMPTS || !isTransient(error)) break
      console.warn(`[ai:${task}] attempt ${attempt} failed, retrying`)
      // A short pause also lets a rate-limit window move on.
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt))
    }
  }

  console.error(`[ai:${task}]`, lastError)
  return { ok: false, error: describeFailure(lastError) }
}

/** Maps a thrown error onto a translation key the UI can render. */
function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/abort|timeout/i.test(message)) return "ai.error.timeout"
  if (/rate.?limit|429/i.test(message)) return "ai.error.rateLimit"
  if (/schema|validat|parse/i.test(message)) return "ai.error.malformed"
  return "ai.error.generic"
}
