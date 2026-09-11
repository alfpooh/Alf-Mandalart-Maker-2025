/**
 * Which model runs which job.
 *
 * Every AI call in the app resolves its model through `modelFor()`, so nothing
 * else in the codebase names a model. Switching providers means editing the
 * `PROVIDERS` map and one env var — no call site changes.
 *
 * Per-task env overrides let a single job move without disturbing the rest:
 *
 *   AI_MODEL=gemini-flash-latest              # default for every task
 *   AI_MODEL_DEPENDENCIES=gemini-pro-latest   # just this one
 *   AI_PROVIDER=google
 */

import { google } from "@ai-sdk/google"
import { groq } from "@ai-sdk/groq"
import type { JSONValue, LanguageModel } from "ai"

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
  | "translate"

export const AI_TASKS: AiTask[] = [
  "subgoals",
  "actions",
  "refine",
  "dependencies",
  "progress",
  "review",
  "translate",
]

type ProviderId = "google" | "groq"

/**
 * Adding a provider is one entry here plus its `@ai-sdk/*` package.
 * The AI SDK's `LanguageModel` is the seam that keeps call sites untouched.
 */
const PROVIDERS: Record<ProviderId, (modelId: string) => LanguageModel> = {
  google: (modelId) => google(modelId),
  groq: (modelId) => groq(modelId),
}

const DEFAULT_PROVIDER: ProviderId = "google"

/**
 * Default models, per provider.
 *
 * Keyed by provider because a model id means nothing outside the provider it
 * belongs to: `AI_PROVIDER=groq` has to fall back to Groq's ids, not Gemini's.
 *
 * On Google the two `-latest` aliases are deliberate. A pinned id is the safer
 * choice when someone is watching the app, but this one runs unattended, and
 * the failure modes are not symmetric: an alias drifts to a newer model of the
 * same class, while a pinned id eventually stops resolving altogether — which
 * is exactly how `llama-3.1-8b-instant` took this app down. Pinning is one env
 * var away when a specific version matters.
 *
 * `dependencies` and `review` are the two jobs per plan that carry actual
 * judgement — working out what blocks what, and reading a whole plan for gaps —
 * so they get the pro model. The other fifteen calls are shape-following, and
 * flash is both faster and cheaper at it.
 */
const TASK_DEFAULTS: Record<ProviderId, Record<AiTask, string>> = {
  google: {
    subgoals: "gemini-flash-latest",
    actions: "gemini-flash-latest",
    refine: "gemini-flash-latest",
    dependencies: "gemini-pro-latest",
    progress: "gemini-flash-latest",
    review: "gemini-pro-latest",
    // Translation is faithful rewriting, not judgement — flash does it well
    // and a plan is ~137 strings in one call.
    translate: "gemini-flash-latest",
  },
  // Kept working so the provider can be switched back with one env var.
  // Of what Groq still serves, only the gpt-oss family accepts
  // `response_format: json_schema`; qwen and the compound models return 400,
  // and structured output is what the app is built on.
  groq: {
    subgoals: "openai/gpt-oss-20b",
    actions: "openai/gpt-oss-20b",
    refine: "openai/gpt-oss-20b",
    dependencies: "openai/gpt-oss-120b",
    progress: "openai/gpt-oss-20b",
    review: "openai/gpt-oss-120b",
    translate: "openai/gpt-oss-20b",
  },
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
    TASK_DEFAULTS[resolveProvider()][task]
  )
}

/** The model instance for a task. This is the only way the app names a model. */
export function modelFor(task: AiTask): LanguageModel {
  return PROVIDERS[resolveProvider()](modelIdFor(task))
}

/**
 * How long a task may run before it is abandoned.
 *
 * Generous, because a rate-limited call waits out its window and retries: on a
 * free tier a plan's calls exceed the per-minute allowance between them, so
 * finishing slowly beats failing fast.
 */
export const TASK_TIMEOUT_MS: Record<AiTask, number> = {
  subgoals: 60_000,
  actions: 60_000,
  refine: 30_000,
  dependencies: 90_000,
  progress: 30_000,
  review: 90_000,
  // A whole plan in one request, so it gets the longest window.
  translate: 120_000,
}

/**
 * How much of the token budget each task may spend on thinking.
 *
 * Both providers charge for reasoning tokens and both let it be turned down,
 * under different names — Groq calls it `reasoningEffort`, Gemini
 * `thinkingConfig.thinkingLevel` — over the same low/medium/high scale, so one
 * table drives both.
 *
 * The setting is not cosmetic. Left at its default on gpt-oss, a generation
 * call sometimes spent the whole budget on reasoning and returned an empty
 * body, which the API rejected as `json_validate_failed` with
 * `failed_generation: ""` — one area of a plan failing repeatedly for no
 * visible reason. Generation is shape-following, so it is turned down;
 * dependencies and review are the jobs where the reasoning is the point.
 */
const TASK_REASONING: Record<AiTask, "low" | "medium" | "high"> = {
  subgoals: "low",
  actions: "low",
  refine: "low",
  dependencies: "medium",
  progress: "low",
  review: "medium",
  translate: "low",
}

/**
 * Provider-specific request options for a task.
 *
 * Kept here beside the provider table so that swapping providers means editing
 * one file — call sites pass this through without naming a provider.
 */
export function providerOptionsFor(
  task: AiTask,
): Record<string, Record<string, JSONValue>> {
  switch (resolveProvider()) {
    case "google":
      return { google: { thinkingConfig: { thinkingLevel: TASK_REASONING[task] } } }
    case "groq":
      return { groq: { reasoningEffort: TASK_REASONING[task] } }
  }
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
