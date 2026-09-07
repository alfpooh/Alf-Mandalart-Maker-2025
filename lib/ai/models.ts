/**
 * Which model runs which job.
 *
 * Every AI call in the app resolves its model through `modelFor()`, so nothing
 * else in the codebase names a model. Switching providers means editing the
 * `PROVIDERS` map and one env var — no call site changes.
 *
 * Per-task env overrides let a single job move without disturbing the rest:
 *
 *   AI_MODEL=llama-3.3-70b-versatile             # default for every task
 *   AI_MODEL_DEPENDENCIES=llama-3.3-70b-versatile # just this one
 *   AI_PROVIDER=groq
 */

import { groq } from "@ai-sdk/groq"
import type { LanguageModel } from "ai"

/**
 * The jobs the app asks a model to do. Split by what they demand rather than by
 * where they are called from: `dependencies` and `review` need real reasoning,
 * the rest are closer to well-shaped generation.
 */
export type AiTask =
  | "subgoals"
  | "actions"
  | "refine"
  | "dependencies"
  | "progress"
  | "review"

export const AI_TASKS: AiTask[] = [
  "subgoals",
  "actions",
  "refine",
  "dependencies",
  "progress",
  "review",
]

type ProviderId = "groq"

/**
 * Adding a provider is one entry here plus its `@ai-sdk/*` package.
 * The AI SDK's `LanguageModel` is the seam that keeps call sites untouched.
 */
const PROVIDERS: Record<ProviderId, (modelId: string) => LanguageModel> = {
  groq: (modelId) => groq(modelId),
}

const DEFAULT_PROVIDER: ProviderId = "groq"

/**
 * Default for the generation jobs.
 *
 * `llama-3.1-8b-instant`, which this app shipped with, was withdrawn from Groq
 * and now returns 404 `model_not_found`. Of what remains, only the gpt-oss
 * family accepts `response_format: json_schema`; qwen and the compound models
 * reject it with a 400, and structured output is what replaced the old regex
 * parsing, so they are not usable here.
 */
const DEFAULT_MODEL = "openai/gpt-oss-20b"

/**
 * Working out prerequisites and reviewing a whole plan are the two jobs that
 * need actual reasoning. Measured on the same eight actions, 120b found a
 * correct prerequisite that 20b missed and gave better rationales, at roughly
 * 1.5x the output tokens — worth it on the two calls per plan that carry the
 * most judgement, not on the sixty-four that do not.
 */
const REASONING_MODEL = "openai/gpt-oss-120b"

const TASK_DEFAULTS: Record<AiTask, string> = {
  subgoals: DEFAULT_MODEL,
  actions: DEFAULT_MODEL,
  refine: DEFAULT_MODEL,
  dependencies: REASONING_MODEL,
  progress: DEFAULT_MODEL,
  review: REASONING_MODEL,
}

/** Env var carrying the override for one task, e.g. `AI_MODEL_SUBGOALS`. */
function envKeyFor(task: AiTask): string {
  return `AI_MODEL_${task.toUpperCase()}`
}

function resolveProvider(): ProviderId {
  const configured = process.env.AI_PROVIDER
  if (configured && configured in PROVIDERS) return configured as ProviderId
  return DEFAULT_PROVIDER
}

/** Most specific wins: per-task env, then global env, then the built-in default. */
export function modelIdFor(task: AiTask): string {
  return (
    process.env[envKeyFor(task)] ||
    process.env.AI_MODEL ||
    TASK_DEFAULTS[task]
  )
}

/** The model instance for a task. This is the only way the app names a model. */
export function modelFor(task: AiTask): LanguageModel {
  return PROVIDERS[resolveProvider()](modelIdFor(task))
}

/**
 * How long a task may run before it is abandoned.
 *
 * Generous, because a rate-limited call waits out its window and retries: on
 * Groq's free tier a plan's calls exceed the per-minute token allowance
 * between them, so finishing slowly beats failing fast.
 */
export const TASK_TIMEOUT_MS: Record<AiTask, number> = {
  subgoals: 60_000,
  actions: 60_000,
  refine: 30_000,
  dependencies: 90_000,
  progress: 30_000,
  review: 90_000,
}

/** Current configuration, for the health endpoint and for debugging. */
export function describeConfig(): {
  provider: string
  models: Record<AiTask, string>
} {
  return {
    provider: resolveProvider(),
    models: Object.fromEntries(
      AI_TASKS.map((task) => [task, modelIdFor(task)]),
    ) as Record<AiTask, string>,
  }
}
