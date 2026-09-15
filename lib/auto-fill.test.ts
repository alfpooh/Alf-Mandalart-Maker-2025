/**
 * Tests for filling a plan's blank schedule cells.
 *
 * What these protect: nothing a person typed is overwritten, finished and
 * empty actions are skipped, a missing AI answer falls back to the default,
 * start dates follow prerequisites (and weekends when the plan skips them),
 * a blank deadline becomes the computed end, and a model's answer cannot
 * land on the wrong action or outside 1–365 days.
 *
 * 2026-09-14 is a Monday; 09-18 a Friday.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { DEFAULT_ESTIMATE_DAYS, autoFill, estimatesFromModel, needsEstimate } from "./auto-fill.ts"
import type { PlannedAction } from "./schedule.ts"
import type { ActionDependency } from "./types.ts"

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

function action(n: number, overrides: Partial<PlannedAction> = {}): PlannedAction {
  return {
    id: u(n),
    subgoalId: u(1000),
    area: 1,
    position: n,
    content: `action ${n}`,
    progress: 0,
    startDate: null,
    estimateDays: null,
    dueDate: null,
    dateLocked: false,
    todoRank: null,
    completedAt: null,
    ...overrides,
  }
}

const edge = (later: number, earlier: number): ActionDependency => ({
  actionId: u(later),
  dependsOnId: u(earlier),
  rationale: "",
  confidence: 1,
  userEdited: true,
})

describe("autoFill", () => {
  const actions = [
    action(1),
    action(2),
    action(3, { estimateDays: 2, startDate: "2026-09-20", dueDate: "2026-09-30" }),
    action(4, { progress: 100 }),
    action(5, { estimateDays: 5 }),
    action(6, { content: "   " }),
  ]
  const deps = [edge(2, 1)]
  const { changes, rows } = autoFill(actions, deps, new Map([[u(1), 3]]), { mode: "calendar", today: "2026-09-14" })

  it("fills blank estimates, starts and deadlines, following prerequisites", () => {
    assert.deepEqual(changes, [
      { id: u(1), estimateDays: 3, startDate: "2026-09-14", dueDate: "2026-09-16" },
      { id: u(2), estimateDays: DEFAULT_ESTIMATE_DAYS, startDate: "2026-09-17", dueDate: "2026-09-23" },
      { id: u(5), startDate: "2026-09-14", dueDate: "2026-09-18" },
    ])
  })

  it("says where each estimate came from", () => {
    assert.deepEqual(rows.map((row) => row.estimate?.source), ["ai", "default", undefined])
  })

  it("leaves typed values, finished actions and empty cells alone", () => {
    const touched = new Set(changes.map((change) => change.id))
    for (const id of [u(3), u(4), u(6)]) assert.equal(touched.has(id), false)
  })

  it("keeps a fixed action's missing start blank rather than guessing one", () => {
    const fixed = autoFill([action(7, { estimateDays: 1, dateLocked: true })], [], new Map(), { mode: "calendar", today: "2026-09-14" })
    assert.equal("startDate" in fixed.changes[0], false)
  })

  it("counts working days when the plan skips weekends", () => {
    const { changes: workdays } = autoFill([action(1)], [], new Map([[u(1), 2]]), { mode: "workdays", today: "2026-09-18" })
    assert.deepEqual(workdays, [{ id: u(1), estimateDays: 2, startDate: "2026-09-18", dueDate: "2026-09-21" }])
  })

  it("has nothing to do when nothing is blank", () => {
    assert.deepEqual(autoFill([action(3, { estimateDays: 2, startDate: "2026-09-20", dueDate: "2026-09-30" })], [], new Map(), { mode: "calendar", today: "2026-09-14" }).changes, [])
  })
})

describe("needsEstimate", () => {
  it("lists only unfinished, non-empty actions with no estimate", () => {
    const list = [action(1), action(2, { estimateDays: 4 }), action(3, { progress: 100 }), action(4, { content: "" })]
    assert.deepEqual(needsEstimate(list).map((a) => a.id), [u(1)])
  })
})

describe("estimatesFromModel", () => {
  it("maps positions to actions, dropping unknown and repeated ones and keeping days in range", () => {
    const ids = [u(1), u(2), u(3)]
    const mapped = estimatesFromModel(
      [
        { index: 0, days: 4 },
        { index: 0, days: 9 },
        { index: 1, days: 400 },
        { index: 2, days: 0 },
        { index: 7, days: 5 },
      ],
      ids,
    )
    assert.deepEqual([...mapped], [[u(1), 4], [u(2), 365], [u(3), 1]])
  })
})
