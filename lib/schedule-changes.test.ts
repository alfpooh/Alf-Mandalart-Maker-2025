/**
 * Tests for reordering a filtered list and for showing changes before they
 * are saved.
 *
 * What these protect: dragging inside a filtered view never moves an action
 * the person could not see, and the screen's optimistic copy agrees with what
 * the database will store.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applyChanges, mergeOrder, rankChanges, type PlannedAction } from "./schedule.ts"

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

describe("mergeOrder", () => {
  it("rearranges the visible actions inside the slots they held, leaving hidden ones in place", () => {
    // Visible: a, c, e. Dragged e to the top.
    assert.deepEqual(mergeOrder(["a", "b", "c", "d", "e"], ["e", "a", "c"]), ["e", "b", "a", "d", "c"])
  })

  it("changes nothing when the visible order is unchanged", () => {
    assert.deepEqual(mergeOrder(["a", "b", "c"], ["a", "c"]), ["a", "b", "c"])
  })

  it("produces ranks for every action whose place moved", () => {
    const actions = [action(1, { todoRank: 1 }), action(2, { todoRank: 2 }), action(3, { todoRank: 3 })]
    const merged = mergeOrder([u(1), u(2), u(3)], [u(3), u(1)])
    assert.deepEqual(merged, [u(3), u(2), u(1)])
    assert.deepEqual(rankChanges(merged, actions), [
      { id: u(3), todoRank: 1 },
      { id: u(1), todoRank: 3 },
    ])
  })
})

describe("applyChanges", () => {
  const now = "2026-09-15T08:00:00.000Z"

  it("changes only the keys given, and clears a key given as null", () => {
    const [changed, untouched] = applyChanges(
      [action(1, { startDate: "2026-09-14", dueDate: "2026-09-30", estimateDays: 3 }), action(2)],
      [{ id: u(1), startDate: null, todoRank: 4 }],
      now,
    )
    assert.deepEqual(
      [changed.startDate, changed.dueDate, changed.estimateDays, changed.todoRank],
      [null, "2026-09-30", 3, 4],
    )
    assert.deepEqual(untouched, action(2))
  })

  it("stamps completion on reaching 100%, keeps an existing stamp, and clears it below 100%", () => {
    const [done] = applyChanges([action(1, { progress: 50 })], [{ id: u(1), progress: 100 }], now)
    assert.equal(done.completedAt, now)

    const earlier = "2026-09-01T00:00:00.000Z"
    const [stillDone] = applyChanges([action(1, { progress: 100, completedAt: earlier })], [{ id: u(1), progress: 100 }], now)
    assert.equal(stillDone.completedAt, earlier)

    const [reopened] = applyChanges([action(1, { progress: 100, completedAt: earlier })], [{ id: u(1), progress: 0 }], now)
    assert.equal(reopened.completedAt, null)
  })
})
