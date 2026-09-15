/**
 * Tests for editing the schedule table.
 *
 * What these protect: a date a person types is never moved by automatic
 * scheduling, tabbing through a row changes nothing, every edit can be undone
 * exactly, and the table flags what needs attention without crying wolf over
 * finished work.
 *
 * 2026-09-14 is a Monday.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  fieldChange,
  forwardPass,
  isNoop,
  scheduleIssues,
  undoFor,
  type PlannedAction,
} from "./schedule.ts"
import type { ActionDependency } from "./types.ts"

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const TODAY = "2026-09-14"

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

describe("fieldChange", () => {
  it("fixes a start date a person types, and releases it when cleared", () => {
    assert.deepEqual(fieldChange(action(1), "startDate", "2026-09-20"), {
      ok: true,
      change: { id: u(1), startDate: "2026-09-20", dateLocked: true },
    })
    assert.deepEqual(fieldChange(action(1, { startDate: "2026-09-20", dateLocked: true }), "startDate", ""), {
      ok: true,
      change: { id: u(1), startDate: null, dateLocked: false },
    })
  })

  it("changes nothing when the value is what is already stored", () => {
    const stored = action(1, { startDate: "2026-09-20", estimateDays: 3, dueDate: "2026-09-30" })
    for (const [field, value] of [["startDate", "2026-09-20"], ["estimateDays", "3"], ["dueDate", "2026-09-30"]] as const) {
      const result = fieldChange(stored, field, value)
      assert.equal(result.ok, true)
      assert.equal(isNoop(stored, (result as { change: Parameters<typeof isNoop>[1] }).change), true, field)
    }
    const empty = fieldChange(action(2), "startDate", "")
    assert.deepEqual(empty, { ok: true, change: { id: u(2) } }, "an empty box left empty does not unlock anything")
  })

  it("reads an estimate as whole days from 1 to 365, and an empty box as none", () => {
    assert.deepEqual(fieldChange(action(1), "estimateDays", " 7 "), { ok: true, change: { id: u(1), estimateDays: 7 } })
    assert.deepEqual(fieldChange(action(1, { estimateDays: 7 }), "estimateDays", ""), { ok: true, change: { id: u(1), estimateDays: null } })
    for (const bad of ["0", "366", "2.5", "-1", "abc"]) {
      assert.deepEqual(fieldChange(action(1), "estimateDays", bad), { ok: false, reason: "estimate" }, bad)
    }
  })

  it("refuses a date that does not exist", () => {
    assert.deepEqual(fieldChange(action(1), "dueDate", "2026-02-30"), { ok: false, reason: "date" })
  })

  it("sets the lock alone when the checkbox is used", () => {
    assert.deepEqual(fieldChange(action(1, { startDate: "2026-09-20" }), "dateLocked", true), {
      ok: true,
      change: { id: u(1), dateLocked: true },
    })
  })
})

describe("undoFor", () => {
  it("puts back exactly the fields the change touches", () => {
    const before = action(1, { startDate: null, dateLocked: false, estimateDays: 3, dueDate: "2026-09-30" })
    const change = { id: u(1), startDate: "2026-09-20", dateLocked: true }
    assert.deepEqual(undoFor(before, change), { id: u(1), startDate: null, dateLocked: false })
  })
})

describe("scheduleIssues", () => {
  const options = { mode: "calendar" as const, today: TODAY }

  it("flags work with no estimate as not scheduled", () => {
    const actions = [action(1)]
    assert.deepEqual(scheduleIssues(actions[0], forwardPass(actions, [], options).get(u(1))), [{ kind: "unscheduled" }])
  })

  it("flags a fixed date that overlaps its prerequisite", () => {
    const actions = [
      action(1, { startDate: "2026-09-14", estimateDays: 7 }),
      action(2, { startDate: "2026-09-16", estimateDays: 1, dateLocked: true }),
    ]
    const entries = forwardPass(actions, [edge(2, 1)], options)
    assert.deepEqual(scheduleIssues(actions[1], entries.get(u(2))), [{ kind: "conflict", ids: [u(1)] }])
    assert.deepEqual(scheduleIssues(actions[0], entries.get(u(1))), [])
  })

  it("flags work that ends after its deadline, by how many days", () => {
    const actions = [action(1, { startDate: "2026-09-14", estimateDays: 10, dueDate: "2026-09-20", dateLocked: true })]
    assert.deepEqual(scheduleIssues(actions[0], forwardPass(actions, [], options).get(u(1))), [{ kind: "endsAfterDue", days: 3 }])
  })

  it("flags a prerequisite with no estimate, and says where automatic scheduling would move an unfixed start", () => {
    const actions = [action(1), action(2, { estimateDays: 2 })]
    assert.deepEqual(scheduleIssues(actions[1], forwardPass(actions, [edge(2, 1)], options).get(u(2))), [
      { kind: "unknownPrerequisite", ids: [u(1)] },
      { kind: "moves", start: TODAY },
    ])
  })

  it("says nothing about finished work", () => {
    const actions = [action(1, { progress: 100, dueDate: "2026-09-01", estimateDays: 30, startDate: "2026-09-01" })]
    assert.deepEqual(scheduleIssues(actions[0], forwardPass(actions, [], options).get(u(1))), [])
  })
})
