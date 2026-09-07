/**
 * Structured-output schemas.
 *
 * These replace the old numbered-list parsing. When a response does not match,
 * `generateObject` throws — which is the point: the previous code silently fell
 * back to placeholder text and reported success, so a failed generation was
 * indistinguishable from a good one. Under a one-per-day quota that is the
 * difference between a usable Mandalart and a wasted day.
 */

import { z } from "zod"
import { ACTIONS_PER_SUBGOAL, PROGRESS_VALUES, SUBGOAL_COUNT } from "../types"

const shortText = z.string().trim().min(1).max(300)

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export const subgoalsSchema = z.object({
  subgoals: z
    .array(
      z.object({
        content: shortText.describe("A goal statement for one of the eight areas"),
      }),
    )
    .length(SUBGOAL_COUNT),
})

export type SubgoalsResult = z.infer<typeof subgoalsSchema>

export const actionsSchema = z.object({
  actions: z
    .array(
      z.object({
        content: shortText.describe("A concrete, doable step"),
        metric: z
          .string()
          .trim()
          .max(120)
          .nullable()
          .describe("How the person will know this is done, or null"),
      }),
    )
    .length(ACTIONS_PER_SUBGOAL),
})

export type ActionsResult = z.infer<typeof actionsSchema>

export const refineSchema = z.object({
  suggestions: z
    .array(
      z.object({
        content: shortText,
        rationale: z.string().trim().max(200).describe("Why this version is better"),
      }),
    )
    .min(1)
    .max(3),
})

export type RefineResult = z.infer<typeof refineSchema>

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Positions rather than ids: the model handles small integers far more reliably
 * than UUIDs, and the caller maps them back. Out-of-range indices are dropped
 * during mapping instead of failing the whole call.
 */
export const dependenciesSchema = z.object({
  dependencies: z
    .array(
      z.object({
        action: z
          .number()
          .int()
          .describe("Index of the action that must wait"),
        dependsOn: z
          .number()
          .int()
          .describe("Index of the action that must finish first"),
        rationale: z.string().trim().max(200),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe("How certain this ordering is; 0.5 when unsure"),
      }),
    )
    .max(40),
})

export type DependenciesResult = z.infer<typeof dependenciesSchema>

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Free-text progress read as one of the six valid values.
 *
 * The result is always shown to the user for confirmation before it is saved —
 * progress is a self-assessment, and a model that silently marks someone down
 * loses their trust in one step.
 */
export const progressSchema = z.object({
  progress: z
    .number()
    .refine((n) => (PROGRESS_VALUES as number[]).includes(n), {
      message: "Must be one of 0, 10, 25, 50, 75, 100",
    })
    .describe("0 not started, 10 started, 25 underway, 50 halfway, 75 nearly done, 100 done"),
  rationale: z
    .string()
    .trim()
    .max(200)
    .describe("One sentence, in the user's language, on why this reading fits"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Below 0.5 when the note is too vague to place"),
})

export type ProgressResult = z.infer<typeof progressSchema>

// ---------------------------------------------------------------------------
// Whole-plan review
// ---------------------------------------------------------------------------

export const reviewSchema = z.object({
  duplicates: z
    .array(
      z.object({
        actions: z.array(z.number().int()).min(2).max(4),
        note: z.string().trim().max(200),
      }),
    )
    .max(8),
  imbalance: z
    .array(z.string().trim().max(200))
    .max(4)
    .describe("Areas over- or under-represented across the 64 actions"),
  weeklyHoursEstimate: z
    .number()
    .min(0)
    .max(168)
    .describe("Estimated hours per week if every action ran at once"),
  missing: z
    .array(z.string().trim().max(200))
    .max(4)
    .describe("Perspectives absent from the plan"),
})

export type ReviewResult = z.infer<typeof reviewSchema>
