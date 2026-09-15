/**
 * Tests for scheduling and the to-do list.
 *
 * What these protect: a date never shifts because of the time zone of the
 * machine doing the sums, a date a person fixed is never moved, work never
 * starts before what it waits on unless a person said so (and then it is
 * flagged), weekends are skipped when asked, and the to-do order explains
 * itself.
 *
 * 2026-09-14 is a Monday; 09-19 and 09-20 are the weekend.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildTodo,
  daysBetween,
  endOf,
  firstWorkingDay,
  forwardPass,
  inView,
  isDateString,
  isTimeZone,
  orderTodo,
  rankChanges,
  scheduleChanges,
  shiftDays,
  todayIn,
  validateChanges,
  wouldCreateCycle,
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
    estimateDays: 1,
    dueDate: null,
    dateLocked: false,
    todoRank: null,
    completedAt: null,
    ...overrides,
  }
}

/** `later` waits on `earlier`. */
const edge = (later: number, earlier: number): ActionDependency => ({
  actionId: u(later),
  dependsOnId: u(earlier),
  rationale: "",
  confidence: 0.9,
  userEdited: false,
})

const slot = (entries: ReturnType<typeof forwardPass>, n: number) => entries.get(u(n))?.slot ?? null

describe("calendar days", () => {
  it("accepts only real days written YYYY-MM-DD", () => {
    assert.equal(isDateString("2026-09-14"), true)
    assert.equal(isDateString("2028-02-29"), true)
    assert.equal(isDateString("2026-02-30"), false)
    assert.equal(isDateString("2026-9-14"), false)
    assert.equal(isDateString(null), false)
  })

  it("moves across months and years, and skips weekends when asked", () => {
    assert.equal(shiftDays("2026-12-30", 3), "2027-01-02")
    assert.equal(shiftDays("2026-09-18", 1, "workdays"), "2026-09-21")
    assert.equal(firstWorkingDay("2026-09-19", "workdays"), "2026-09-21")
    assert.equal(firstWorkingDay("2026-09-19", "calendar"), "2026-09-19")
    assert.equal(endOf("2026-09-17", 3, "workdays"), "2026-09-21")
    assert.equal(endOf("2026-09-17", 3, "calendar"), "2026-09-19")
    assert.equal(daysBetween("2026-09-14", "2026-09-10"), -4)
  })

  it("counts days the same whatever time zone the machine is in", () => {
    const original = process.env.TZ
    try {
      const results = ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Seoul"].map((zone) => {
        process.env.TZ = zone
        return [shiftDays("2026-03-07", 2), endOf("2026-10-30", 5, "workdays"), daysBetween("2026-03-01", "2026-04-01")]
      })
      for (const result of results) assert.deepEqual(result, results[0])
    } finally {
      process.env.TZ = original
    }
  })

  it("resolves today in the plan owner's time zone", () => {
    const moment = new Date("2026-09-14T23:30:00Z")
    assert.equal(todayIn("Asia/Seoul", moment), "2026-09-15")
    assert.equal(todayIn("America/Los_Angeles", moment), "2026-09-14")
    assert.equal(todayIn("Not/AZone", moment), "2026-09-14", "an unknown zone falls back to UTC")
    assert.equal(isTimeZone("Europe/Helsinki"), true)
    assert.equal(isTimeZone(""), false)
  })
})

describe("forwardPass", () => {
  const calendar = { mode: "calendar" as const, today: TODAY }
  const workdays = { mode: "workdays" as const, today: TODAY }

  it("starts work the day after what it waits on ends", () => {
    const entries = forwardPass(
      [action(1, { startDate: "2026-09-14", estimateDays: 3 }), action(2, { estimateDays: 2 })],
      [edge(2, 1)],
      calendar,
    )
    assert.deepEqual(slot(entries, 1), { start: "2026-09-14", end: "2026-09-16" })
    assert.deepEqual(slot(entries, 2), { start: "2026-09-17", end: "2026-09-18" })
  })

  it("follows the latest of several prerequisites", () => {
    const entries = forwardPass(
      [
        action(1, { startDate: "2026-09-14", estimateDays: 2 }),
        action(2, { startDate: "2026-09-14", estimateDays: 5 }),
        action(3, { estimateDays: 1 }),
      ],
      [edge(3, 1), edge(3, 2)],
      calendar,
    )
    assert.equal(slot(entries, 3)?.start, "2026-09-19")
  })

  it("skips weekends in workdays mode, both for starts and for durations", () => {
    const entries = forwardPass(
      [action(1, { startDate: "2026-09-17", estimateDays: 3 }), action(2, { estimateDays: 1 }), action(3, { startDate: "2026-09-19", estimateDays: 1 })],
      [edge(2, 1)],
      workdays,
    )
    assert.deepEqual(slot(entries, 1), { start: "2026-09-17", end: "2026-09-21" })
    assert.equal(slot(entries, 2)?.start, "2026-09-22")
    assert.equal(slot(entries, 3)?.start, "2026-09-21", "a Saturday start moves to Monday")
  })

  it("keeps a locked date and reports the prerequisite it overlaps instead of moving it", () => {
    const entries = forwardPass(
      [action(1, { startDate: "2026-09-14", estimateDays: 5 }), action(2, { startDate: "2026-09-15", estimateDays: 1, dateLocked: true })],
      [edge(2, 1)],
      calendar,
    )
    assert.equal(slot(entries, 2)?.start, "2026-09-15")
    assert.deepEqual(entries.get(u(2))?.conflicts, [u(1)])
  })

  it("keeps a later date the action already has", () => {
    const entries = forwardPass(
      [action(1, { startDate: "2026-09-14", estimateDays: 1 }), action(2, { startDate: "2026-10-01", estimateDays: 1 })],
      [edge(2, 1)],
      calendar,
    )
    assert.equal(slot(entries, 2)?.start, "2026-10-01")
    assert.deepEqual(entries.get(u(2))?.conflicts, [])
  })

  it("starts undated work today", () => {
    assert.equal(slot(forwardPass([action(1, { estimateDays: 2 })], [], calendar), 1)?.start, TODAY)
  })

  it("leaves work without an estimate unscheduled, and lets what follows it be flagged rather than blocked", () => {
    const entries = forwardPass([action(1, { estimateDays: null }), action(2, { estimateDays: 1 })], [edge(2, 1)], calendar)
    assert.equal(slot(entries, 1), null)
    assert.equal(slot(entries, 2)?.start, TODAY)
    assert.deepEqual(entries.get(u(2))?.unknownPrerequisites, [u(1)])
  })

  it("does not let finished work hold anything up", () => {
    const entries = forwardPass(
      [action(1, { startDate: "2026-09-14", estimateDays: 30, progress: 100 }), action(2, { estimateDays: 1 })],
      [edge(2, 1)],
      calendar,
    )
    assert.equal(slot(entries, 2)?.start, TODAY)
    assert.equal(slot(entries, 1)?.start, "2026-09-14", "finished work keeps its dates")
  })

  it("survives a cycle in the edges instead of looping", () => {
    const entries = forwardPass(
      [action(1, { estimateDays: 1 }), action(2, { estimateDays: 1 })],
      [edge(1, 2), { ...edge(2, 1), confidence: 0.1 }],
      calendar,
    )
    assert.equal(entries.size, 2)
    assert.ok(slot(entries, 1) && slot(entries, 2))
  })
})

describe("scheduleChanges", () => {
  it("lists only the start dates that would change, never locked or finished ones", () => {
    const actions = [
      action(1, { startDate: "2026-09-14", estimateDays: 3 }),
      action(2, { startDate: "2026-09-15", estimateDays: 1 }),
      action(3, { startDate: "2026-09-15", estimateDays: 1, dateLocked: true }),
      action(4, { startDate: "2026-09-10", estimateDays: 1, progress: 100 }),
    ]
    const entries = forwardPass(actions, [edge(2, 1), edge(3, 1)], { mode: "calendar", today: TODAY })
    assert.deepEqual(scheduleChanges(actions, entries), [{ id: u(2), startDate: "2026-09-17" }])
  })
})

describe("buildTodo", () => {
  it("sorts actions into now, waiting and done", () => {
    const items = buildTodo([action(1), action(2), action(3, { progress: 100 })], [edge(2, 1)], TODAY)
    assert.deepEqual(items.map((i) => [i.action.position, i.group]), [[1, "now"], [2, "waiting"], [3, "done"]])
    assert.deepEqual(items[1].blockedBy, [u(1)])
  })

  it("treats an action waiting only on finished work as startable", () => {
    const items = buildTodo([action(1, { progress: 100 }), action(2)], [edge(2, 1)], TODAY)
    assert.equal(items[1].group, "now")
  })

  it("counts only the work that finishing this action would free", () => {
    // 3 waits on 1 alone; 4 waits on 1 and 2.
    const items = buildTodo([action(1), action(2), action(3), action(4)], [edge(3, 1), edge(4, 1), edge(4, 2)], TODAY)
    assert.equal(items[0].unlocks, 1)
    assert.deepEqual(items[0].reasons, [{ kind: "unlocks", count: 1 }])
  })

  it("ranks an overdue deadline above a close one, and a close one above none", () => {
    const items = buildTodo(
      [action(1, { dueDate: "2026-09-10" }), action(2, { dueDate: "2026-09-16" }), action(3)],
      [],
      TODAY,
    )
    assert.deepEqual(items[0].reasons, [{ kind: "overdue", days: 4 }])
    assert.deepEqual(items[1].reasons, [{ kind: "dueSoon", days: 2 }])
    assert.ok(items[0].score > items[1].score && items[1].score > items[2].score)
  })

  it("nudges an area that has fallen behind the rest of the plan", () => {
    const items = buildTodo(
      [action(1, { area: 1, progress: 75 }), action(2, { area: 1, progress: 75 }), action(3, { area: 2 })],
      [],
      TODAY,
    )
    assert.deepEqual(items[2].reasons, [{ kind: "behindArea", area: 2 }])
    assert.equal(items[0].reasons.length, 0)
  })
})

describe("orderTodo", () => {
  it("puts the order a person chose first, then the rest by score", () => {
    const items = buildTodo(
      [action(1, { dueDate: "2026-09-10" }), action(2, { todoRank: 2 }), action(3, { todoRank: 1 }), action(4), action(5, { progress: 100, todoRank: 1 })],
      [],
      TODAY,
    )
    assert.deepEqual(orderTodo(items).map((i) => i.action.position), [3, 2, 1, 4, 5])
  })
})

describe("inView", () => {
  const actions = [
    action(1),
    action(2, { startDate: "2026-09-18", estimateDays: 1 }),
    action(3, { startDate: "2026-10-05", estimateDays: 1 }),
    action(4, { dueDate: "2026-09-16" }),
    action(5, { progress: 100 }),
    action(6),
  ]
  const deps = [edge(6, 1)]
  const entries = forwardPass(actions, deps, { mode: "calendar", today: TODAY })
  const items = buildTodo(actions, deps, TODAY)
  const view = (name: Parameters<typeof inView>[1]) =>
    items.filter((i) => inView(i, name, TODAY, entries)).map((i) => i.action.position)

  it("shows today what can start today", () => {
    assert.deepEqual(view("today"), [1, 4])
  })

  it("shows this week what starts or is due within seven days", () => {
    assert.deepEqual(view("week"), [1, 2, 4, 6])
  })

  it("keeps waiting and done apart", () => {
    assert.deepEqual(view("waiting"), [6])
    assert.deepEqual(view("done"), [5])
  })
})

describe("rankChanges", () => {
  it("returns ranks only for actions whose place changed", () => {
    const actions = [action(1, { todoRank: 1 }), action(2, { todoRank: 2 }), action(3)]
    assert.deepEqual(rankChanges([u(1), u(3), u(2)], actions), [
      { id: u(3), todoRank: 2 },
      { id: u(2), todoRank: 3 },
    ])
  })
})

describe("wouldCreateCycle", () => {
  it("refuses an edge that closes a loop, however long", () => {
    const deps = [edge(2, 1), edge(3, 2)]
    assert.equal(wouldCreateCycle(deps, u(1), u(3)), true)
    assert.equal(wouldCreateCycle(deps, u(1), u(1)), true)
    assert.equal(wouldCreateCycle(deps, u(3), u(1)), false)
  })
})

describe("validateChanges", () => {
  it("accepts a well-formed batch and keeps only the keys given", () => {
    const result = validateChanges([{ id: u(1), startDate: "2026-09-14", estimateDays: 3, dateLocked: true }, { id: u(2), dueDate: null }])
    assert.deepEqual(result, {
      ok: true,
      changes: [{ id: u(1), startDate: "2026-09-14", estimateDays: 3, dateLocked: true }, { id: u(2), dueDate: null }],
    })
  })

  it("names what is wrong", () => {
    assert.deepEqual(validateChanges([]), { ok: false, reason: "empty" })
    assert.deepEqual(validateChanges([{ id: u(1) }]), { ok: false, reason: "empty" })
    assert.deepEqual(validateChanges([{ id: "x", startDate: "2026-09-14" }]), { ok: false, reason: "id" })
    assert.deepEqual(validateChanges([{ id: u(1), startDate: "2026-02-30" }]), { ok: false, reason: "date" })
    assert.deepEqual(validateChanges([{ id: u(1), estimateDays: 0 }]), { ok: false, reason: "estimate" })
    assert.deepEqual(validateChanges([{ id: u(1), estimateDays: 1.5 }]), { ok: false, reason: "estimate" })
    assert.deepEqual(validateChanges([{ id: u(1), progress: 60 }]), { ok: false, reason: "progress" })
    assert.deepEqual(validateChanges([{ id: u(1), owner: "x" }]), { ok: false, reason: "shape" })
    assert.deepEqual(validateChanges([{ id: u(1), todoRank: 1 }, { id: u(1), todoRank: 2 }]), { ok: false, reason: "id" })
    assert.deepEqual(validateChanges(Array.from({ length: 65 }, (_, i) => ({ id: u(i), todoRank: 1 }))), { ok: false, reason: "too-many" })
  })
})
