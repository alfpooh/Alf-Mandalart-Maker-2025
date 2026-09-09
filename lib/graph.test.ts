/**
 * Tests for the dependency graph.
 *
 * These cover the one failure that would hang the tracking view: a cycle in the
 * dependency edges. The model that proposes those edges produces cycles
 * routinely, so `breakCycles` is the guard the rest of the feature stands on.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  breakCycles,
  computeReadiness,
  isAcyclic,
  suggestedOrder,
  unlockedBy,
} from "./graph.ts"
import { snapToStage } from "./types.ts"
import type { Action, ActionDependency, ProgressValue } from "./types.ts"

function action(id: string, progress: ProgressValue = 0, position = 0): Action {
  return {
    id,
    planId: "plan",
    subgoalId: "subgoal",
    position: position as Action["position"],
    content: id,
    metric: null,
    cadence: "once",
    dueDate: null,
    progress,
    updatedAt: "",
  }
}

function edge(
  actionId: string,
  dependsOnId: string,
  confidence = 0.8,
  userEdited = false,
): ActionDependency {
  return { actionId, dependsOnId, rationale: "", confidence, userEdited }
}

describe("breakCycles", () => {
  it("breaks a two-node cycle, dropping the weaker edge", () => {
    const { edges, removed } = breakCycles([edge("A", "B", 0.9), edge("B", "A", 0.3)])
    assert.equal(edges.length, 1)
    assert.equal(removed.length, 1)
    assert.equal(edges[0].confidence, 0.9)
  })

  it("breaks a three-node cycle at its weakest link", () => {
    const { edges, removed } = breakCycles([
      edge("A", "B", 0.9),
      edge("B", "C", 0.8),
      edge("C", "A", 0.2),
    ])
    assert.equal(edges.length, 2)
    assert.equal(removed[0].confidence, 0.2)
  })

  it("never drops an edge a person edited, however low its confidence", () => {
    const { edges } = breakCycles([edge("A", "B", 0.99), edge("B", "A", 0.01, true)])
    assert.equal(edges.length, 1)
    assert.equal(edges[0].userEdited, true)
  })

  it("drops self-edges and duplicates", () => {
    const { edges } = breakCycles([edge("A", "A"), edge("B", "C"), edge("B", "C")])
    assert.ok(!edges.some((e) => e.actionId === e.dependsOnId))
    assert.equal(edges.filter((e) => e.actionId === "B").length, 1)
  })

  it("leaves an acyclic graph alone, including diamonds", () => {
    const { edges, removed } = breakCycles([
      edge("A", "B"),
      edge("B", "C"),
      edge("A", "C"),
    ])
    assert.equal(edges.length, 3)
    assert.equal(removed.length, 0)
  })

  it("handles a long chain closed into one cycle", () => {
    const chain = Array.from({ length: 20 }, (_, i) => edge(`n${i + 1}`, `n${i}`, 0.9))
    chain.push(edge("n0", "n20", 0.1))

    const { edges, removed } = breakCycles(chain)
    assert.equal(edges.length, 20)
    assert.equal(removed.length, 1)
    assert.ok(isAcyclic(edges))
  })
})

describe("computeReadiness", () => {
  const chain = [edge("B", "A"), edge("C", "B")]

  it("surfaces only the action with no prerequisites", () => {
    const { ready, blocked } = computeReadiness(
      [action("A"), action("B"), action("C")],
      chain,
    )
    assert.equal(ready.length, 1)
    assert.equal(ready[0].action.id, "A")
    assert.equal(blocked.length, 2)
    assert.equal(blocked.find((e) => e.action.id === "B")?.blockedBy[0].id, "A")
  })

  it("frees the next action once its prerequisite completes", () => {
    const { ready, blocked, done } = computeReadiness(
      [action("A", 100), action("B"), action("C")],
      chain,
    )
    assert.deepEqual(done.map((a) => a.id), ["A"])
    assert.deepEqual(ready.map((e) => e.action.id), ["B"])
    assert.deepEqual(blocked.map((e) => e.action.id), ["C"])
  })

  it("does not unblock on partial progress — only 100% counts", () => {
    const { ready, blocked } = computeReadiness(
      [action("A", 75), action("B")],
      [edge("B", "A")],
    )
    assert.deepEqual(ready.map((e) => e.action.id), ["A"])
    assert.deepEqual(blocked.map((e) => e.action.id), ["B"])
  })

  it("ignores edges pointing at actions outside the plan", () => {
    const { ready } = computeReadiness([action("A")], [edge("A", "ghost")])
    assert.equal(ready.length, 1)
  })
})

describe("unlockedBy", () => {
  const both = [edge("D", "B"), edge("D", "C")]

  it("reports nothing while another prerequisite is still open", () => {
    const actions = [action("B", 100), action("C"), action("D")]
    assert.equal(unlockedBy("B", actions, both).length, 0)
  })

  it("reports the action freed by the final prerequisite", () => {
    const actions = [action("B", 100), action("C", 100), action("D")]
    assert.deepEqual(unlockedBy("C", actions, both).map((a) => a.id), ["D"])
  })
})

describe("suggestedOrder", () => {
  const actions = [action("A", 0, 0), action("B", 0, 1), action("C", 0, 2)]

  it("places prerequisites before the work that needs them", () => {
    const order = suggestedOrder(actions, [edge("A", "C"), edge("B", "A")]).map((a) => a.id)
    assert.ok(order.indexOf("C") < order.indexOf("A"))
    assert.ok(order.indexOf("A") < order.indexOf("B"))
  })

  it("includes every action exactly once", () => {
    assert.equal(suggestedOrder(actions, []).length, 3)
  })

  it("terminates on cyclic input instead of looping", () => {
    const cyclic = [edge("A", "B", 0.5), edge("B", "C", 0.5), edge("C", "A", 0.5)]
    assert.equal(suggestedOrder(actions, cyclic).length, 3)
  })
})

describe("snapToStage", () => {
  it("rounds to the nearest rung", () => {
    assert.equal(snapToStage(60), 50)
    assert.equal(snapToStage(63), 75)
    assert.equal(snapToStage(7), 10)
    assert.equal(snapToStage(4), 0)
  })

  it("clamps out-of-range input", () => {
    assert.equal(snapToStage(150), 100)
    assert.equal(snapToStage(-20), 0)
  })
})
