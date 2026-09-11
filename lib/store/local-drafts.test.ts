/**
 * Tests for removing and restoring an action.
 *
 * These cover the reported loss: delete an action, add one back, and the
 * generated metric was gone with no way to recover it.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { removalOf, removeAction, restoreAction } from "./local-drafts.ts"
import type { ActionDependency, EditorCell, EditorDraft } from "../types.ts"

function cell(id: string, content: string, metric: string | null): EditorCell {
  return { id, content, metric, isConfirmed: true, isEditing: false }
}

function draft(edges: ActionDependency[] = []): EditorDraft {
  return {
    id: "plan",
    mainGoal: "goal",
    language: "ko",
    step: "review-actions",
    subgoals: [{ id: "s1", content: "area", metric: null, isConfirmed: true, isEditing: false }],
    actions: {
      s1: [
        cell("a1", "첫 번째", "5km"),
        cell("a2", "두 번째", "주 3회"),
        cell("a3", "세 번째", null),
      ],
    },
    dependencies: edges,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

describe("removalOf", () => {
  it("captures the metric, which is what deleting used to destroy", () => {
    const removed = removalOf(draft(), "s1", 1)
    assert.equal(removed?.cell.content, "두 번째")
    assert.equal(removed?.cell.metric, "주 3회")
    assert.equal(removed?.index, 1)
  })

  it("captures edges on both sides of the action", () => {
    const edges: ActionDependency[] = [
      { actionId: "a2", dependsOnId: "a1", rationale: "r", confidence: 0.9, userEdited: false },
      { actionId: "a3", dependsOnId: "a2", rationale: "r", confidence: 0.8, userEdited: false },
      { actionId: "a3", dependsOnId: "a1", rationale: "r", confidence: 0.7, userEdited: false },
    ]
    const removed = removalOf(draft(edges), "s1", 1)
    assert.equal(removed?.edges.length, 2)
  })

  it("returns null for an index that is not there", () => {
    assert.equal(removalOf(draft(), "s1", 9), null)
    assert.equal(removalOf(draft(), "nope", 0), null)
  })
})

describe("restoreAction", () => {
  it("puts the action back with its text and metric intact", () => {
    const before = draft()
    const removed = removalOf(before, "s1", 1)!
    const after = restoreAction(removeAction(before, "s1", 1), removed)

    assert.deepEqual(
      after.actions.s1.map((c) => [c.content, c.metric]),
      [["첫 번째", "5km"], ["두 번째", "주 3회"], ["세 번째", null]],
    )
  })

  it("puts it back at its old index rather than at the end", () => {
    const before = draft()
    const removed = removalOf(before, "s1", 0)!
    const after = restoreAction(removeAction(before, "s1", 0), removed)
    assert.equal(after.actions.s1[0].id, "a1")
    assert.deepEqual(after.actions.s1.map((c) => c.id), ["a1", "a2", "a3"])
  })

  it("keeps the confirmed flag, so the count returns to what it was", () => {
    const before = draft()
    const removed = removalOf(before, "s1", 1)!
    const gone = removeAction(before, "s1", 1)
    assert.equal(gone.actions.s1.filter((c) => c.isConfirmed).length, 2)

    const after = restoreAction(gone, removed)
    assert.equal(after.actions.s1.filter((c) => c.isConfirmed).length, 3)
  })

  it("restores the prerequisite edges the removal dropped", () => {
    const edges: ActionDependency[] = [
      { actionId: "a2", dependsOnId: "a1", rationale: "r", confidence: 0.9, userEdited: false },
      { actionId: "a3", dependsOnId: "a1", rationale: "r", confidence: 0.7, userEdited: false },
    ]
    const before = draft(edges)
    const removed = removalOf(before, "s1", 1)!
    const gone = removeAction(before, "s1", 1)
    assert.equal(gone.dependencies.length, 1)

    const after = restoreAction(gone, removed)
    assert.equal(after.dependencies.length, 2)
  })

  it("does not duplicate an action that is already back", () => {
    const before = draft()
    const removed = removalOf(before, "s1", 1)!
    const once = restoreAction(removeAction(before, "s1", 1), removed)
    const twice = restoreAction(once, removed)
    assert.equal(twice.actions.s1.length, 3)
  })

  it("refuses to push an area past its eight actions", () => {
    const full = draft()
    full.actions.s1 = Array.from({ length: 8 }, (_, i) => cell(`f${i}`, `x${i}`, null))
    const removed = removalOf(draft(), "s1", 1)!
    assert.equal(restoreAction(full, removed).actions.s1.length, 8)
  })
})
