/**
 * Tests for translating a plan's text without disturbing the plan.
 *
 * The requirement these encode: content, order, ids and confirmed state all
 * survive, and nothing the user wrote is replaced by nothing.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applyTranslations, draftToStrings, stringCount } from "./translate-draft.ts"
import type { ActionDependency, EditorCell, EditorDraft } from "./types.ts"

function cell(id: string, content: string, metric: string | null, confirmed = true): EditorCell {
  return { id, content, metric, isConfirmed: confirmed, isEditing: false }
}

const edges: ActionDependency[] = [
  { actionId: "a2", dependsOnId: "a1", rationale: "먼저", confidence: 0.9, userEdited: true },
]

function draft(): EditorDraft {
  return {
    id: "plan",
    mainGoal: "하프 마라톤 완주",
    language: "ko",
    step: "visualization",
    subgoals: [cell("s1", "달리기 훈련", null), cell("s2", "근력 운동", null, false)],
    actions: {
      s1: [cell("a1", "주 3회 조깅", "30분"), cell("a2", "10km 대회", null, false)],
      s2: [cell("a3", "스쿼트", "주 2회")],
    },
    dependencies: edges,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

describe("draftToStrings", () => {
  it("lists main goal, then each area with its actions as content+metric pairs", () => {
    assert.deepEqual(draftToStrings(draft()), [
      "하프 마라톤 완주",
      "달리기 훈련", "주 3회 조깅", "30분", "10km 대회", "",
      "근력 운동", "스쿼트", "주 2회",
    ])
  })

  it("counts what it will produce", () => {
    assert.equal(stringCount(draft()), draftToStrings(draft()).length)
  })
})

describe("applyTranslations", () => {
  const translated = [
    "Finish a half marathon",
    "Running training", "Jog three times a week", "30 minutes", "10km race", "",
    "Strength work", "Squats", "Twice a week",
  ]

  it("replaces every piece of text", () => {
    const out = applyTranslations(draft(), translated, "en")
    assert.equal(out.ok, true)
    if (!out.ok) return
    assert.equal(out.draft.mainGoal, "Finish a half marathon")
    assert.equal(out.draft.subgoals[0].content, "Running training")
    assert.equal(out.draft.actions.s1[0].content, "Jog three times a week")
    assert.equal(out.draft.actions.s1[0].metric, "30 minutes")
    assert.equal(out.draft.actions.s2[0].metric, "Twice a week")
  })

  it("keeps ids, order and confirmed state — the plan itself must not move", () => {
    const out = applyTranslations(draft(), translated, "en")
    assert.equal(out.ok, true)
    if (!out.ok) return
    assert.deepEqual(out.draft.subgoals.map((s) => s.id), ["s1", "s2"])
    assert.deepEqual(out.draft.actions.s1.map((a) => a.id), ["a1", "a2"])
    assert.equal(out.draft.subgoals[1].isConfirmed, false)
    assert.equal(out.draft.actions.s1[1].isConfirmed, false)
    assert.equal(out.draft.actions.s1[0].isConfirmed, true)
  })

  it("leaves the dependency graph alone", () => {
    const out = applyTranslations(draft(), translated, "en")
    assert.equal(out.ok, true)
    if (!out.ok) return
    assert.deepEqual(out.draft.dependencies, edges)
  })

  it("records the new language, so later generation matches the content", () => {
    const out = applyTranslations(draft(), translated, "en")
    assert.equal(out.ok, true)
    if (!out.ok) return
    assert.equal(out.draft.language, "en")
  })

  it("does not invent a measure for an action that never had one", () => {
    const withMetric = [...translated]
    withMetric[5] = "Something the model made up"   // a2's metric slot, was null
    const out = applyTranslations(draft(), withMetric, "en")
    assert.equal(out.ok, true)
    if (!out.ok) return
    assert.equal(out.draft.actions.s1[1].metric, null)
  })

  it("keeps the original when a translation comes back empty", () => {
    const holes = [...translated]
    holes[1] = "   "   // the first area
    holes[3] = ""      // a metric that did exist
    const out = applyTranslations(draft(), holes, "en")
    assert.equal(out.ok, true)
    if (!out.ok) return
    assert.equal(out.draft.subgoals[0].content, "달리기 훈련")
    assert.equal(out.draft.actions.s1[0].metric, "30분")
  })

  it("refuses a response of the wrong length rather than shifting everything", () => {
    // One missing item would otherwise slide every later cell up by one and
    // write an area's text into an action.
    assert.deepEqual(applyTranslations(draft(), translated.slice(0, -1), "en"), {
      ok: false,
      reason: "length",
    })
    assert.deepEqual(applyTranslations(draft(), [...translated, "extra"], "en"), {
      ok: false,
      reason: "length",
    })
  })

  it("round-trips: applying the original strings changes nothing but the language", () => {
    const before = draft()
    const out = applyTranslations(before, draftToStrings(before), "en")
    assert.equal(out.ok, true)
    if (!out.ok) return
    assert.deepEqual({ ...out.draft, language: "ko" }, before)
  })
})
