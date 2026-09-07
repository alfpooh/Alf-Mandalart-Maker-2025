"use server"

import { generateObject } from "ai"
import type { z } from "zod"
import { modelFor, TASK_TIMEOUT_MS, type AiTask } from "./ai/models"
import {
  actionsPrompt,
  dependenciesPrompt,
  progressPrompt,
  refinePrompt,
  reviewPrompt,
  subgoalsPrompt,
} from "./ai/prompts"
import {
  actionsSchema,
  dependenciesSchema,
  progressSchema,
  refineSchema,
  reviewSchema,
  subgoalsSchema,
} from "./ai/schemas"
import { breakCycles } from "./graph"
import { snapToStage, type ActionDependency, type Language, type ProgressValue } from "./types"

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
 * Runs an async mapper over items with a ceiling on how many are in flight.
 *
 * Groq's free tier caps tokens per minute (8,000 at the time of writing), and
 * a plan's eight action calls want roughly 15,000 between them — gpt-oss spends
 * reasoning tokens on top of the visible output. Firing all eight at once puts
 * every one of them into the same rate-limit window and several fail together.
 * Spreading them out costs a little wall time and returns eight complete areas
 * instead of six.
 */
async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}

/** How many model calls may be in flight at once. */
const CONCURRENCY = Number(process.env.AI_CONCURRENCY ?? "2")

/**
 * True when a failure is worth another attempt with the same input.
 *
 * gpt-oss intermittently returns the JSON Schema it was given instead of data
 * matching it. Groq rejects that as `json_validate_failed` and marks it
 * non-retryable, so the SDK gives up — but the very same request usually
 * succeeds on the next try, so it is retryable in practice.
 */
function isTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /schema|json_validate|does not match|rate.?limit|429|5\d\d/i.test(message)
}

const MAX_ATTEMPTS = 3

async function run<S extends z.ZodType>(
  task: AiTask,
  schema: S,
  prompt: string,
): Promise<AiResult<z.infer<S>>> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { object } = await generateObject({
        model: modelFor(task),
        schema,
        prompt,
        // Rate-limit rejections are retryable and the window is short; the
        // SDK's default of 2 gives up while the batch is still contending.
        maxRetries: 5,
        abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS[task]),
      })
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

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export async function generateSubgoals(
  mainGoal: string,
  language: Language,
): Promise<AiResult<string[]>> {
  const result = await run(
    "subgoals",
    subgoalsSchema,
    subgoalsPrompt(mainGoal, language),
  )
  if (!result.ok) return result
  return { ok: true, data: result.data.subgoals.map((s) => s.content) }
}

export interface GeneratedAction {
  content: string
  metric: string | null
}

export async function generateActionsForSubgoal(
  subgoal: string,
  mainGoal: string,
  siblingSubgoals: string[],
  language: Language,
): Promise<AiResult<GeneratedAction[]>> {
  const result = await run(
    "actions",
    actionsSchema,
    actionsPrompt(subgoal, mainGoal, siblingSubgoals, language),
  )
  if (!result.ok) return result
  return { ok: true, data: result.data.actions }
}

export interface SubgoalActions {
  subgoalIndex: number
  actions: GeneratedAction[] | null
  error: string | null
}

/**
 * All eight subgoals at once.
 *
 * The old code awaited these in a loop — eight sequential round trips behind a
 * single spinner. Running them together makes the wait one round trip instead
 * of eight. A subgoal that fails is reported on its own so the user can retry
 * just that area rather than starting over.
 */
export async function generateAllActions(
  subgoals: string[],
  mainGoal: string,
  language: Language,
): Promise<SubgoalActions[]> {
  return mapLimited(subgoals, CONCURRENCY, async (subgoal, index) => {
    const siblings = subgoals.filter((_, i) => i !== index)
    const result = await generateActionsForSubgoal(subgoal, mainGoal, siblings, language)
    return result.ok
      ? { subgoalIndex: index, actions: result.data, error: null }
      : { subgoalIndex: index, actions: null, error: result.error }
  })
}

/** Regenerates one cell. The old reject button rebuilt all eight to use one. */
export async function refineCell(
  content: string,
  context: { mainGoal: string; subgoal?: string },
  mode: "specific" | "measurable" | "smaller" | "alternatives",
  language: Language,
): Promise<AiResult<{ content: string; rationale: string }[]>> {
  const result = await run(
    "refine",
    refineSchema,
    refinePrompt(content, context, mode, language),
  )
  if (!result.ok) return result
  return { ok: true, data: result.data.suggestions }
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Prerequisites among one subgoal's eight actions.
 *
 * Scoped to a single area on purpose: asking about all 64 at once produces both
 * worse relationships and far more cycles. Most real prerequisites live inside
 * an area anyway.
 *
 * `actionIds` maps the indices the model returns back onto rows. Indices out of
 * range are dropped rather than failing the call — a malformed edge is worth
 * less than the other seven.
 */
export async function analyzeDependencies(
  actions: { id: string; content: string }[],
  subgoal: string,
  mainGoal: string,
  planId: string,
  language: Language,
): Promise<AiResult<ActionDependency[]>> {
  const result = await run(
    "dependencies",
    dependenciesSchema,
    dependenciesPrompt(
      actions.map((a) => a.content),
      subgoal,
      mainGoal,
      language,
    ),
  )
  if (!result.ok) return result

  const edges: ActionDependency[] = []
  for (const raw of result.data.dependencies) {
    const from = actions[raw.action]
    const to = actions[raw.dependsOn]
    if (!from || !to || from.id === to.id) continue
    edges.push({
      actionId: from.id,
      dependsOnId: to.id,
      rationale: raw.rationale,
      confidence: raw.confidence,
      userEdited: false,
    })
  }

  // Never hand back a graph the tracking view cannot walk.
  const { edges: acyclic, removed } = breakCycles(edges)
  if (removed.length > 0) {
    console.warn(`[ai:dependencies] dropped ${removed.length} edge(s) for plan ${planId}`)
  }
  return { ok: true, data: acyclic }
}

export interface SubgoalDependencies {
  subgoalIndex: number
  dependencies: ActionDependency[] | null
  error: string | null
}

/**
 * Prerequisites for every area at once.
 *
 * Eight scoped calls rather than one over all 64: a model asked to order 64
 * items produces both weaker relationships and far more cycles, and most real
 * prerequisites sit inside a single area anyway. An area that fails simply
 * contributes no edges — the other seven are still useful.
 */
export async function analyzeAllDependencies(
  subgoals: { id: string; content: string }[],
  actionsBySubgoal: Record<string, { id: string; content: string }[]>,
  mainGoal: string,
  planId: string,
  language: Language,
): Promise<SubgoalDependencies[]> {
  return mapLimited(subgoals, CONCURRENCY, async (subgoal, index) => {
    const actions = actionsBySubgoal[subgoal.id] ?? []
    if (actions.length === 0) {
      return { subgoalIndex: index, dependencies: [], error: null }
    }
    const result = await analyzeDependencies(
      actions,
      subgoal.content,
      mainGoal,
      planId,
      language,
    )
    return result.ok
      ? { subgoalIndex: index, dependencies: result.data, error: null }
      : { subgoalIndex: index, dependencies: null, error: result.error }
  })
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface ProgressReading {
  progress: ProgressValue
  rationale: string
  confidence: number
  /** True when the reading is too uncertain to apply without asking. */
  needsConfirmation: boolean
}

/**
 * Reads a free-text progress note as a percentage.
 *
 * The caller always shows this to the user before saving. Progress is a
 * self-assessment; a model that quietly revises it down loses trust in one
 * step, so this proposes and the person decides.
 */
export async function readProgressFromText(
  note: string,
  action: { content: string; metric: string | null; current: ProgressValue },
  language: Language,
): Promise<AiResult<ProgressReading>> {
  const result = await run("progress", progressSchema, progressPrompt(note, action, language))
  if (!result.ok) return result

  const progress = snapToStage(result.data.progress)
  return {
    ok: true,
    data: {
      progress,
      rationale: result.data.rationale,
      confidence: result.data.confidence,
      needsConfirmation: result.data.confidence < 0.5,
    },
  }
}

// ---------------------------------------------------------------------------
// Whole-plan review
// ---------------------------------------------------------------------------

export async function reviewPlan(
  mainGoal: string,
  subgoals: string[],
  actions: string[],
  language: Language,
): Promise<
  AiResult<{
    duplicates: { actions: number[]; note: string }[]
    imbalance: string[]
    weeklyHoursEstimate: number
    missing: string[]
  }>
> {
  return run("review", reviewSchema, reviewPrompt(mainGoal, subgoals, actions, language))
}
