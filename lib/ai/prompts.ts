/**
 * Prompts, kept out of the call sites so they can be reviewed and versioned.
 *
 * Output language comes from the user's UI selection — it is passed in, never
 * guessed from the input text. The old code sniffed for Hangul, which meant
 * Finnish never worked no matter what the user picked.
 */

import type { Language } from "../types"

const LANGUAGE_NAMES: Record<Language, string> = {
  ko: "Korean (한국어)",
  en: "English",
  fi: "Finnish (suomi)",
}

function languageLine(language: Language): string {
  return `Write every piece of user-facing text in ${LANGUAGE_NAMES[language]}.`
}

/** Shared framing so all six tasks reason about Mandalart the same way. */
const METHOD = `You are helping someone build a Mandalart (만다라트): a 9x9 grid where one
central goal is broken into 8 areas, and each area into 8 concrete actions.

What makes a Mandalart work:
- The 8 areas should cover the goal without overlapping each other.
- Outer cells are actions a person performs, not aspirations they hold.
- Specific beats broad: "read 2 books a month" over "learn more".
- The limited number of cells is the point — it forces a choice about what matters.`

export function subgoalsPrompt(mainGoal: string, language: Language): string {
  return `${METHOD}

${languageLine(language)}

Central goal: "${mainGoal}"

Produce the 8 areas. Together they should cover what the goal actually requires,
without two areas doing the same work. Draw on whichever of these fit the goal —
skills, resources, habits, relationships, environment, measurement, risks,
milestones — but let the goal decide, not the list.

Each area is a short goal statement, not a task.`
}

export function actionsPrompt(
  subgoal: string,
  mainGoal: string,
  siblingSubgoals: string[],
  language: Language,
): string {
  return `${METHOD}

${languageLine(language)}

Central goal: "${mainGoal}"
This area: "${subgoal}"

The other seven areas of this Mandalart, so you do not duplicate their work:
${siblingSubgoals.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Produce the 8 actions for this area. Each one must be something a person can
start and finish — a step, not a theme. Use numbers where a number belongs
(how many, how often, by when).

For each action give a metric when there is an obvious way to tell it is done.
Use null when adding one would be arbitrary; a forced metric is worse than none.`
}

export function refinePrompt(
  content: string,
  context: { mainGoal: string; subgoal?: string },
  mode: "specific" | "measurable" | "smaller" | "alternatives",
  language: Language,
): string {
  const instructions: Record<typeof mode, string> = {
    specific: "Rewrite it so it names exactly what gets done. Remove anything vague.",
    measurable: "Rewrite it with a number — a quantity, a frequency, or a deadline.",
    smaller: "Break it into a first step small enough to do this week.",
    alternatives: "Offer up to 3 genuinely different ways to achieve the same end.",
  }

  return `${METHOD}

${languageLine(language)}

Central goal: "${context.mainGoal}"${context.subgoal ? `\nArea: "${context.subgoal}"` : ""}
Current cell: "${content}"

${instructions[mode]}

Give a one-sentence rationale for each suggestion explaining what improved.`
}

export function dependenciesPrompt(
  actions: string[],
  subgoal: string,
  mainGoal: string,
  language: Language,
): string {
  return `${METHOD}

${languageLine(language)}

Central goal: "${mainGoal}"
Area: "${subgoal}"

Actions, by index:
${actions.map((a, i) => `${i}. ${a}`).join("\n")}

Identify which actions genuinely cannot start until another has finished.

Report only real prerequisites — where attempting the later action first would
waste the effort or be impossible. Do not report a dependency merely because one
action seems to come first in a natural reading order; most of these actions can
run in parallel, and a plan where everything is blocked helps nobody.

Never report both "A depends on B" and "B depends on A".

Set confidence to how sure you are: near 1.0 for a hard prerequisite, 0.5 when
it is a reasonable ordering but not a requirement.

Returning an empty list is the correct answer when the actions are independent.`
}

export function progressPrompt(
  note: string,
  action: { content: string; metric: string | null; current: number },
  language: Language,
): string {
  return `${languageLine(language)}

Someone is reporting progress on one action from their goal plan.

Action: "${action.content}"${action.metric ? `\nHow it is measured: "${action.metric}"` : ""}
Currently recorded at: ${action.current}%

What they wrote: "${note}"

Read this as one of exactly these values:
  0   not started
  10  started — first move made, groundwork begun
  25  underway — real work is happening
  50  halfway — past the midpoint
  75  nearly done — the end is in sight
  100 done — finished, nothing left

Judge only what the note says. If it describes less progress than the recorded
value, report the lower figure — people revise their own estimates, and a note
saying "this stalled" means what it says.

If the note is too vague to place, choose the closest value and set confidence
below 0.5 so they get asked rather than silently recorded.`
}

export function reviewPrompt(
  mainGoal: string,
  subgoals: string[],
  actions: string[],
  language: Language,
): string {
  return `${METHOD}

${languageLine(language)}

Central goal: "${mainGoal}"

Areas:
${subgoals.map((s, i) => `${i + 1}. ${s}`).join("\n")}

All 64 actions, by index:
${actions.map((a, i) => `${i}. ${a}`).join("\n")}

Review the plan as a whole — this is the check a person cannot do for their own
plan, because they wrote each cell one at a time.

Look for: actions that repeat each other across areas; a lopsided plan (all
study and no practice, all preparation and no delivery); the total weekly time
this would take if every action ran at once; and perspectives that are missing
entirely.

Be concrete and cite indices. If the plan is sound in one of these respects,
return an empty list for it rather than inventing a criticism.`
}

/**
 * Translating an existing plan.
 *
 * Numbered lines, because the mapping back is positional: the count and the
 * order are the contract, and a dropped line would shift every later cell.
 */
export function translatePrompt(items: string[], target: Language): string {
  const numbered = items.map((text, index) => `${index + 1}. ${text}`).join("\n")
  return `Translate a goal plan into ${LANGUAGE_NAMES[target]}.

Return exactly ${items.length} translations, in the same order as the input.
Line ${items.length} must be the translation of line ${items.length}.

Rules:
- Translate meaning, not words. These are goals and concrete actions; keep them
  as short and as actionable as the original.
- A line that is empty stays empty. Never invent text for it.
- Keep numbers, units, dates and proper nouns exactly as they are.
- Do not merge, split, reorder, add or drop lines.

Lines:
${numbered}`
}
