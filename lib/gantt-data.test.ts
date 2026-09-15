/**
 * Tests for turning a plan into Gantt rows and a drag back into changes.
 *
 * What these protect: a bar covers exactly the days the schedule says, a drag
 * becomes the date and length the person meant (working days when weekends
 * are skipped), dragged dates are fixed, what follows a moved action is
 * offered for moving — only what actually moves, never a fixed date — and
 * plan text cannot become markup in the chart.
 *
 * 2026-09-14 is a Monday; 09-19 and 09-20 are the weekend.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  areaRowId,
  dragChange,
  dragConsequences,
  escapeHtml,
  ganttRows,
  linkId,
  progressFromDrag,
  workingDaysInclusive,
} from "./gantt-data.ts"
import { forwardPass, type PlannedAction } from "./schedule.ts"
import type { ActionDependency } from "./types.ts"

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const TODAY = "2026-09-14"
const calendar = { mode: "calendar" as const, today: TODAY }

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

describe("ganttRows", () => {
  const subgoals = [
    { id: u(1001), position: 1, content: "second area" },
    { id: u(1000), position: 0, content: "first area" },
    { id: u(1002), position: 2, content: "empty area" },
  ]
  const actions = [
    action(1, { startDate: "2026-09-14", estimateDays: 3, dateLocked: true }),
    action(2, { estimateDays: 2 }),
    action(3),
    action(4, { subgoalId: u(1001), area: 2, estimateDays: 1, progress: 100, startDate: "2026-09-10" }),
    action(5, { subgoalId: u(1002), area: 3 }),
  ]
  const deps = [edge(2, 1), edge(3, 1)]
  const { rows, links, unscheduled } = ganttRows(subgoals, actions, deps, forwardPass(actions, deps, calendar))

  it("puts each scheduled action under its area, areas in order, skipping areas with nothing scheduled", () => {
    assert.deepEqual(rows.map((r) => r.id), [areaRowId(1), u(1), u(2), areaRowId(2), u(4)])
    assert.equal(rows.find((r) => r.id === u(2))?.parent, areaRowId(1))
    assert.equal(rows[0].type, "project")
  })

  it("covers exactly the scheduled days, and carries progress, lock and completion", () => {
    const first = rows.find((r) => r.id === u(1))!
    assert.deepEqual([first.start_date, first.duration, first.locked, first.estimate], ["2026-09-14", 3, true, 3])
    const second = rows.find((r) => r.id === u(2))!
    assert.deepEqual([second.start_date, second.duration], ["2026-09-17", 2])
    const done = rows.find((r) => r.id === u(4))!
    assert.deepEqual([done.progress, done.done, done.readonly], [1, true, true])
  })

  it("spans an area row over its actions and keeps it from being dragged", () => {
    const area = rows[0]
    assert.deepEqual([area.start_date, area.duration, area.readonly], ["2026-09-14", 5, true])
  })

  it("lists undated actions separately and links only scheduled ones", () => {
    assert.deepEqual(unscheduled.map((a) => a.id), [u(3), u(5)])
    assert.deepEqual(links, [{ id: linkId(u(1), u(2)), source: u(1), target: u(2), type: "0" }])
  })
})

describe("escapeHtml", () => {
  it("turns markup in plan text into plain text", () => {
    assert.equal(escapeHtml(`<img src=x onerror="alert('x')"> & more`), "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; more")
  })
})

describe("dragChange", () => {
  it("fixes the new start of a moved bar and keeps its estimate", () => {
    assert.deepEqual(dragChange(action(1, { estimateDays: 3 }), "2026-09-16", "2026-09-19", "calendar", "move"), {
      id: u(1),
      startDate: "2026-09-16",
      dateLocked: true,
    })
  })

  it("reads a resized bar's length from its exclusive end", () => {
    // Bar from the 14th to the 18th inclusive: exclusive end the 19th, five days.
    assert.deepEqual(dragChange(action(1), "2026-09-14", "2026-09-19", "calendar", "resize"), {
      id: u(1),
      startDate: "2026-09-14",
      dateLocked: true,
      estimateDays: 5,
    })
  })

  it("counts working days when the plan skips weekends, and never starts on a weekend", () => {
    // Thursday 17th to Tuesday 22nd inclusive: Thu, Fri, Mon, Tue.
    assert.equal(dragChange(action(1), "2026-09-17", "2026-09-23", "workdays", "resize").estimateDays, 4)
    assert.equal(dragChange(action(1), "2026-09-19", "2026-09-22", "workdays", "move").startDate, "2026-09-21")
    assert.equal(workingDaysInclusive("2026-09-19", "2026-09-20"), 1, "a weekend-only span still counts as one")
  })
})

describe("progressFromDrag", () => {
  it("snaps to the progress ladder", () => {
    assert.equal(progressFromDrag(0.32), 25)
    assert.equal(progressFromDrag(0.66), 75)
    assert.equal(progressFromDrag(1.4), 100)
    assert.equal(progressFromDrag(-1), 0)
  })
})

describe("dragConsequences", () => {
  const actions = [
    action(1, { startDate: "2026-09-14", estimateDays: 3 }),
    action(2, { startDate: "2026-09-17", estimateDays: 2 }),
    action(3, { startDate: "2026-09-19", estimateDays: 1 }),
    action(4, { startDate: "2026-09-19", estimateDays: 1, dateLocked: true }),
    action(5, { startDate: "2026-09-14", estimateDays: 1 }),
  ]
  const deps = [edge(2, 1), edge(3, 2), edge(4, 2)]

  it("offers to push the unfixed actions that come after, and flags the fixed one instead", () => {
    const { shifts, conflicts } = dragConsequences(actions, deps, { id: u(1), startDate: "2026-09-16", dateLocked: true }, calendar)
    assert.deepEqual(shifts, [
      { id: u(2), from: "2026-09-17", startDate: "2026-09-19" },
      { id: u(3), from: "2026-09-19", startDate: "2026-09-21" },
    ])
    assert.deepEqual(conflicts, [])
    const afterPush = dragConsequences(actions, deps, { id: u(2), startDate: "2026-09-19", dateLocked: true }, calendar)
    assert.equal(afterPush.shifts.some((s) => s.id === u(4)), false, "a fixed follower is never offered for moving")
  })

  it("offers nothing when the change moves no follower", () => {
    const { shifts } = dragConsequences(actions, deps, { id: u(5), startDate: "2026-09-15", dateLocked: true }, calendar)
    assert.deepEqual(shifts, [])
  })

  it("reports the prerequisite a dragged-in-front action now overlaps", () => {
    const { conflicts } = dragConsequences(actions, deps, { id: u(2), startDate: "2026-09-15", dateLocked: true }, calendar)
    assert.deepEqual(conflicts, [u(1)])
  })
})
