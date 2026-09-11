/**
 * Turning a plan into a list of strings and back.
 *
 * Translation goes out as a flat, ordered list and comes back the same way, so
 * nothing but the text can move: ids, positions, confirmed flags and the
 * dependency graph never leave the browser. A model that renames a field or
 * drops an item cannot corrupt the plan — a length mismatch is refused outright.
 *
 * Order is mainGoal, then for each subgoal its own text followed by each of its
 * actions as a (content, metric) pair. Grouping an area's text together also
 * gives the model the context it needs to translate consistently.
 */

import type { EditorDraft, Language } from "./types.ts"

/** A metric that is absent travels as an empty string and returns as null. */
const ABSENT = ""

export function draftToStrings(draft: EditorDraft): string[] {
  const items: string[] = [draft.mainGoal]
  for (const subgoal of draft.subgoals) {
    items.push(subgoal.content)
    for (const action of draft.actions[subgoal.id] ?? []) {
      items.push(action.content)
      items.push(action.metric ?? ABSENT)
    }
  }
  return items
}

/** How many strings `draftToStrings` will produce, without building them. */
export function stringCount(draft: EditorDraft): number {
  return draftToStrings(draft).length
}

export type ApplyResult =
  | { ok: true; draft: EditorDraft }
  | { ok: false; reason: "length" }

/**
 * Writes translated text back, position by position.
 *
 * Everything that identifies or orders a cell is carried over from the original
 * rather than from the response. An empty translation keeps the original text:
 * losing a goal is worse than leaving one untranslated.
 */
export function applyTranslations(
  draft: EditorDraft,
  translated: string[],
  language: Language,
): ApplyResult {
  if (translated.length !== stringCount(draft)) return { ok: false, reason: "length" }

  let at = 0
  const next = (fallback: string): string => {
    const value = (translated[at++] ?? "").trim()
    return value.length > 0 ? value : fallback
  }

  const mainGoal = next(draft.mainGoal)

  // One pass, in exactly the order draftToStrings wrote: an area, then that
  // area's actions. Consuming all the areas first and the actions afterwards
  // slides every cell by one and writes an area's text into an action.
  const subgoals: EditorDraft["subgoals"] = []
  const actions: Record<string, EditorDraft["actions"][string]> = {}

  for (const subgoal of draft.subgoals) {
    subgoals.push({ ...subgoal, content: next(subgoal.content) })
    actions[subgoal.id] = (draft.actions[subgoal.id] ?? []).map((action) => {
      const content = next(action.content)
      const raw = (translated[at++] ?? "").trim()
      return {
        ...action,
        content,
        // An action that had no measure must not acquire one, and one that had
        // a measure must not lose it to an empty cell in the response.
        metric: action.metric === null ? null : raw.length > 0 ? raw : action.metric,
      }
    })
  }

  return {
    ok: true,
    draft: { ...draft, mainGoal, subgoals, actions, language },
  }
}
