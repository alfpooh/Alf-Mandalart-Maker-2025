/**
 * Tests for what the dashboard shows.
 *
 * What these protect: the numbers on a card match the rows behind it, a tab
 * never hides a plan it should show or shows an archived one, a search finds a
 * goal however it was typed, a copy never shares an id with its original, and
 * the offer to save local drafts never copies another account's plan.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { draftToPayload } from "./plan-sync.ts"
import {
  cleanGoalName,
  confirmsGoal,
  copyName,
  displayStatus,
  duplicateDraft,
  initialTab,
  matchesQuery,
  overview,
  parsePrefs,
  sortPlans,
  summarize,
  summarizeAll,
  tabCounts,
  unsavedLocalDrafts,
  visiblePlans,
  type ActionRow,
  type PlanRow,
  type PlanSummary,
  type SubgoalRow,
} from "./plan-summary.ts"
import type { EditorCell, EditorDraft } from "./types.ts"

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

function planRow(overrides: Partial<PlanRow> = {}): PlanRow {
  return {
    id: u(1),
    main_goal: "하프 마라톤 완주",
    language: "ko",
    status: "active",
    step: "visualization",
    pinned: false,
    created_at: "2026-09-01T00:00:00+00:00",
    updated_at: "2026-09-10T00:00:00+00:00",
    last_activity_at: "2026-09-10T00:00:00+00:00",
    completed_at: null,
    archived_at: null,
    ...overrides,
  }
}

describe("last activity", () => {
  it("ignores the stamp the column put on plans that existed before it", () => {
    const s = summarize(
      planRow({ updated_at: "2026-09-09T09:28:13+00:00", last_activity_at: "2026-09-14T09:00:00+00:00" }),
      [],
      [],
    )
    assert.equal(s.lastActivityAt, "2026-09-09T09:28:13+00:00")
  })

  it("keeps the real activity when pinning or archiving touched the row later", () => {
    const s = summarize(
      planRow({ updated_at: "2026-09-14T12:00:00+00:00", last_activity_at: "2026-09-10T08:00:00+00:00" }),
      [],
      [],
    )
    assert.equal(s.lastActivityAt, "2026-09-10T08:00:00+00:00")
  })
})

/** Rows for one plan: `counts[area]` actions per area, each at `progress(area, index)`. */
function content(
  planId: string,
  counts: number[],
  progress: (area: number, index: number) => number = () => 0,
  base = 1000,
): { subgoals: SubgoalRow[]; actions: ActionRow[] } {
  const subgoals: SubgoalRow[] = []
  const actions: ActionRow[] = []
  counts.forEach((count, area) => {
    const subgoalId = u(base + area)
    subgoals.push({ id: subgoalId, plan_id: planId, position: area })
    for (let i = 0; i < count; i++) {
      actions.push({ plan_id: planId, subgoal_id: subgoalId, progress: progress(area, i) })
    }
  })
  return { subgoals, actions }
}

const FULL = new Array<number>(8).fill(8)

function summary(overrides: Partial<PlanSummary> = {}): PlanSummary {
  return {
    id: u(1),
    mainGoal: "goal",
    language: "en",
    status: "active",
    drafting: false,
    pinned: false,
    createdAt: "2026-09-01T00:00:00+00:00",
    lastActivityAt: "2026-09-10T00:00:00+00:00",
    subgoalCount: 8,
    filled: 64,
    done: 0,
    progress: 0,
    areas: new Array<number>(8).fill(0),
    ...overrides,
  }
}

function cell(id: string, content: string, confirmed = true): EditorCell {
  return { id, content, metric: null, isConfirmed: confirmed, isEditing: false }
}

function localDraft(id: string, overrides: Partial<EditorDraft> = {}): EditorDraft {
  return {
    id,
    mainGoal: "goal",
    language: "en",
    step: "review-subgoals",
    subgoals: [cell(u(8000), "area")],
    actions: {},
    dependencies: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  }
}

describe("displayStatus", () => {
  it("reads a plan still being written as writing, and a finished one as in progress", () => {
    assert.equal(displayStatus(planRow({ step: "review-actions" })), "writing")
    assert.equal(displayStatus(planRow({ step: "visualization" })), "active")
  })

  it("lets completed and archived win over the step", () => {
    assert.equal(displayStatus(planRow({ status: "completed", step: "review-actions" })), "completed")
    assert.equal(displayStatus(planRow({ status: "archived" })), "archived")
    assert.equal(
      displayStatus(planRow({ status: "completed", archived_at: "2026-09-11T00:00:00+00:00" })),
      "archived",
      "an archived timestamp is enough",
    )
  })
})

describe("summarize", () => {
  it("counts a finished plan with nothing done yet", () => {
    const { subgoals, actions } = content(u(1), FULL)
    const s = summarize(planRow(), subgoals, actions)
    assert.equal(s.filled, 64)
    assert.equal(s.done, 0)
    assert.equal(s.progress, 0)
    assert.deepEqual(s.areas, new Array(8).fill(0))
    assert.equal(s.drafting, false)
  })

  it("while writing, shows how much of each area is written", () => {
    const { subgoals, actions } = content(u(1), [8, 8, 8, 4, 0, 0, 0, 0])
    const s = summarize(planRow({ step: "review-actions" }), subgoals, actions)
    assert.equal(s.drafting, true)
    assert.equal(s.filled, 28)
    assert.deepEqual(s.areas, [100, 100, 100, 50, 0, 0, 0, 0])
  })

  it("after writing, averages progress over all 64 cells and counts actions at 100%", () => {
    const { subgoals, actions } = content(u(1), FULL, (area) => (area === 0 ? 100 : area === 1 ? 50 : 0))
    const s = summarize(planRow(), subgoals, actions)
    assert.equal(s.done, 8)
    assert.equal(s.progress, Math.round((800 + 400) / 64))
    assert.deepEqual(s.areas.slice(0, 3), [100, 50, 0])
  })

  it("places areas by position, not by the order rows arrive in", () => {
    const { subgoals, actions } = content(u(1), FULL, (area) => (area === 7 ? 100 : 0))
    const s = summarize(planRow(), [...subgoals].reverse(), actions)
    assert.equal(s.areas[7], 100)
    assert.equal(s.areas[0], 0)
  })

  it("ignores actions under a subgoal the plan does not have", () => {
    const { subgoals, actions } = content(u(1), FULL)
    actions.push({ plan_id: u(1), subgoal_id: u(9999), progress: 100 })
    const s = summarize(planRow(), subgoals, actions)
    assert.equal(s.filled, 64)
    assert.equal(s.done, 0)
  })

  it("reports a plan whose content never reached the account", () => {
    const s = summarize(planRow({ step: "review-subgoals" }), [], [])
    assert.equal(s.subgoalCount, 0)
    assert.equal(s.filled, 0)
    assert.equal(s.status, "writing")
  })

  it("falls back to English for a language the app does not offer", () => {
    assert.equal(summarize(planRow({ language: "de" }), [], []).language, "en")
  })
})

describe("summarizeAll", () => {
  it("gives each plan only its own rows", () => {
    const a = content(u(1), FULL, () => 100, 1000)
    const b = content(u(2), [8, 0, 0, 0, 0, 0, 0, 0], () => 0, 2000)
    const [first, second] = summarizeAll(
      [planRow({ id: u(1) }), planRow({ id: u(2) })],
      [...a.subgoals, ...b.subgoals],
      [...b.actions, ...a.actions],
    )
    assert.equal(first.done, 64)
    assert.equal(second.filled, 8)
    assert.equal(second.done, 0)
  })
})

describe("tabs", () => {
  const plans = [
    summary({ id: u(1), status: "writing" }),
    summary({ id: u(2), status: "active" }),
    summary({ id: u(3), status: "completed" }),
    summary({ id: u(4), status: "archived" }),
  ]

  it("counts plans still being written as in progress, and keeps archived ones out of All", () => {
    assert.deepEqual(tabCounts(plans), { all: 3, active: 2, completed: 1, archived: 1 })
  })

  it("opens on In progress, or on All when nothing is in progress", () => {
    assert.equal(initialTab(plans), "active")
    assert.equal(initialTab([summary({ status: "completed" })]), "all")
    assert.equal(initialTab([]), "all")
  })

  it("keeps the tab chosen last time", () => {
    assert.equal(initialTab(plans, "archived"), "archived")
  })
})

describe("matchesQuery", () => {
  it("finds a goal regardless of case, spacing or full-width letters", () => {
    const plan = summary({ mainGoal: "Run a  Half Marathon" })
    assert.equal(matchesQuery(plan, "half marathon"), true)
    assert.equal(matchesQuery(plan, "  HALF   marathon "), true)
    assert.equal(matchesQuery(plan, "ＨＡＬＦ"), true)
    assert.equal(matchesQuery(plan, "sprint"), false)
  })

  it("finds part of a Korean goal", () => {
    assert.equal(matchesQuery(summary({ mainGoal: "하프 마라톤 완주" }), "마라톤"), true)
  })

  it("treats an empty search as no search", () => {
    assert.equal(matchesQuery(summary(), "   "), true)
  })
})

describe("sortPlans", () => {
  const a = summary({
    id: u(1),
    mainGoal: "나",
    progress: 10,
    createdAt: "2026-09-03T00:00:00+00:00",
    lastActivityAt: "2026-09-05T00:00:00+00:00",
  })
  const b = summary({
    id: u(2),
    mainGoal: "가",
    progress: 80,
    createdAt: "2026-09-01T00:00:00+00:00",
    lastActivityAt: "2026-09-09T00:00:00+00:00",
  })
  const c = summary({
    id: u(3),
    mainGoal: "다",
    progress: 40,
    createdAt: "2026-09-02T00:00:00+00:00",
    lastActivityAt: "2026-09-07T00:00:00+00:00",
  })
  const ids = (list: PlanSummary[]) => list.map((p) => p.id)

  it("sorts by recent activity, creation date, progress or name", () => {
    assert.deepEqual(ids(sortPlans([a, b, c], "activity", "ko")), [u(2), u(3), u(1)])
    assert.deepEqual(ids(sortPlans([a, b, c], "created", "ko")), [u(1), u(3), u(2)])
    assert.deepEqual(ids(sortPlans([a, b, c], "progress", "ko")), [u(2), u(3), u(1)])
    assert.deepEqual(ids(sortPlans([a, b, c], "name", "ko")), [u(2), u(1), u(3)])
  })

  it("keeps pinned plans on top whatever the sort", () => {
    const pinned = { ...a, pinned: true }
    for (const sort of ["activity", "created", "progress", "name"] as const) {
      assert.equal(sortPlans([b, c, pinned], sort, "ko")[0].id, u(1), sort)
    }
  })

  it("ranks equal progress by how much is written", () => {
    const x = summary({ id: u(4), progress: 0, filled: 20 })
    const y = summary({ id: u(5), progress: 0, filled: 60 })
    assert.deepEqual(ids(sortPlans([x, y], "progress", "en")), [u(5), u(4)])
  })

  it("compares timestamps as moments, not as text", () => {
    // 18:00 in Seoul is 09:00 UTC — earlier than 10:00 UTC, though later as text.
    const seoul = summary({ id: u(6), lastActivityAt: "2026-09-14T18:00:00+09:00" })
    const utc = summary({ id: u(7), lastActivityAt: "2026-09-14T10:00:00+00:00" })
    assert.deepEqual(ids(sortPlans([seoul, utc], "activity", "en")), [u(7), u(6)])
  })

  it("leaves the list it was given alone", () => {
    const input = [a, b, c]
    sortPlans(input, "name", "ko")
    assert.deepEqual(ids(input), [u(1), u(2), u(3)])
  })
})

describe("visiblePlans", () => {
  it("applies the tab and the search, then sorts", () => {
    const plans = [
      summary({ id: u(1), mainGoal: "Read 20 books", status: "active" }),
      summary({ id: u(2), mainGoal: "Read more", status: "archived" }),
      summary({ id: u(3), mainGoal: "Swim", status: "active" }),
      summary({ id: u(4), mainGoal: "Read aloud", status: "writing" }),
    ]
    const view = (tab: "all" | "archived") =>
      visiblePlans(plans, { tab, sort: "name", query: "read" }, "en").map((p) => p.id)
    // Digits sort before letters: "Read 20 books" comes before "Read aloud".
    assert.deepEqual(view("all"), [u(1), u(4)])
    assert.deepEqual(view("archived"), [u(2)])
  })
})

describe("overview", () => {
  it("counts in progress and completed, and dates the latest activity outside the archive", () => {
    const o = overview([
      summary({ status: "writing", lastActivityAt: "2026-09-02T00:00:00+00:00" }),
      summary({ status: "completed", lastActivityAt: "2026-09-05T00:00:00+00:00" }),
      summary({ status: "archived", lastActivityAt: "2026-09-12T00:00:00+00:00" }),
    ])
    assert.deepEqual(o, { inProgress: 1, completed: 1, lastActivityAt: "2026-09-05T00:00:00+00:00" })
  })

  it("has no latest activity when there is nothing to date", () => {
    assert.equal(overview([]).lastActivityAt, null)
  })
})

describe("parsePrefs", () => {
  it("reads back a saved tab and sort", () => {
    assert.deepEqual(parsePrefs('{"tab":"completed","sort":"name"}'), { tab: "completed", sort: "name" })
  })

  it("drops what it does not recognise instead of failing", () => {
    assert.deepEqual(parsePrefs('{"tab":"deleted","sort":1}'), {})
    assert.deepEqual(parsePrefs('{"tab":"archived","sort":"random"}'), { tab: "archived" })
    assert.deepEqual(parsePrefs("not json"), {})
    assert.deepEqual(parsePrefs("null"), {})
    assert.deepEqual(parsePrefs(null), {})
  })
})

describe("goal names", () => {
  it("trims a new name and refuses a blank or over-long one", () => {
    assert.equal(cleanGoalName("  완주  "), "완주")
    assert.equal(cleanGoalName("   "), null)
    assert.equal(cleanGoalName("가".repeat(501)), null)
    assert.equal(cleanGoalName("가".repeat(500)), "가".repeat(500))
  })

  it("names a copy in the reader's language, shortening the goal rather than the suffix", () => {
    assert.equal(copyName("완주", "{goal} (사본)"), "완주 (사본)")
    const long = copyName("가".repeat(500), "{goal} (copy)")
    assert.equal(long.length, 500)
    assert.ok(long.endsWith("… (copy)"))
    assert.notEqual(cleanGoalName(long), null, "the copy's name is still one the database accepts")
  })

  it("asks for the exact goal before deleting, forgiving only surrounding spaces and Unicode form", () => {
    assert.equal(confirmsGoal("  완주 ", "완주"), true)
    assert.equal(confirmsGoal("café", "café"), true)
    assert.equal(confirmsGoal("완", "완주"), false)
    assert.equal(confirmsGoal("", "   "), false)
  })
})

describe("unsavedLocalDrafts", () => {
  const account = [summary({ id: u(1), subgoalCount: 8 }), summary({ id: u(2), subgoalCount: 0 })]
  const kinds = (list: ReturnType<typeof unsavedLocalDrafts>) => list.map((x) => [x.draft.id, x.kind])

  it("offers a draft the account does not have", () => {
    assert.deepEqual(kinds(unsavedLocalDrafts([localDraft(u(3))], account)), [[u(3), "import"]])
  })

  it("never offers a plan cached here from another account", () => {
    const theirs = localDraft(u(3), { serverSyncedAt: "2026-09-10T00:00:00+00:00", pendingSync: false })
    assert.deepEqual(unsavedLocalDrafts([theirs], account), [])
  })

  it("offers the content of an account plan whose server copy is empty", () => {
    assert.deepEqual(kinds(unsavedLocalDrafts([localDraft(u(2))], account)), [[u(2), "upload"]])
  })

  it("offers unsaved changes to an account plan, and nothing once they are saved", () => {
    assert.deepEqual(kinds(unsavedLocalDrafts([localDraft(u(1), { pendingSync: true })], account)), [
      [u(1), "upload"],
    ])
    const saved = localDraft(u(1), { pendingSync: false, serverSyncedAt: "2026-09-10T00:00:00+00:00" })
    assert.deepEqual(unsavedLocalDrafts([saved], account), [])
  })

  it("skips a draft with nothing written", () => {
    assert.deepEqual(unsavedLocalDrafts([localDraft(u(3), { subgoals: [] })], account), [])
  })
})

describe("duplicateDraft", () => {
  function source(): EditorDraft {
    return {
      id: u(1),
      mainGoal: "완주",
      language: "ko",
      step: "visualization",
      subgoals: [cell(u(10), "달리기"), cell(u(11), "근력", false)],
      actions: {
        [u(10)]: [{ ...cell(u(100), "조깅"), metric: "30분" }, cell(u(101), "10km")],
        [u(11)]: [cell(u(110), "스쿼트")],
      },
      dependencies: [
        { actionId: u(101), dependsOnId: u(100), rationale: "먼저", confidence: 0.9, userEdited: true },
      ],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
      pendingSync: false,
      serverSyncedAt: "2026-09-02T00:00:00.000Z",
    }
  }
  let next = 5000
  const makeId = () => u(next++)
  const copyOf = (draft: EditorDraft) =>
    duplicateDraft(draft, { id: u(2), mainGoal: "완주 (사본)", now: "2026-09-14T00:00:00.000Z" }, makeId)

  it("copies the structure under new ids everywhere", () => {
    const original = source()
    const copy = copyOf(original)
    const idsOf = (d: EditorDraft) => [
      d.id,
      ...d.subgoals.map((c) => c.id),
      ...Object.values(d.actions).flat().map((c) => c.id),
    ]
    const old = new Set(idsOf(original))
    const fresh = idsOf(copy)
    assert.equal(fresh.some((id) => old.has(id)), false)
    assert.equal(new Set(fresh).size, fresh.length)

    assert.deepEqual(copy.subgoals.map((c) => [c.content, c.isConfirmed]), [["달리기", true], ["근력", false]])
    assert.deepEqual(
      copy.actions[copy.subgoals[0].id].map((c) => [c.content, c.metric]),
      [["조깅", "30분"], ["10km", null]],
    )
    assert.equal(copy.mainGoal, "완주 (사본)")
    assert.equal(copy.step, "visualization")
    assert.equal(copy.createdAt, "2026-09-14T00:00:00.000Z")
    assert.equal(copy.serverSyncedAt, undefined)
  })

  it("points copied prerequisites at the copied actions", () => {
    const copy = copyOf(source())
    const [jog, race] = copy.actions[copy.subgoals[0].id]
    assert.deepEqual(
      copy.dependencies.map((e) => [e.actionId, e.dependsOnId, e.rationale, e.userEdited]),
      [[race.id, jog.id, "먼저", true]],
    )
  })

  it("never opens on a step that would start generating again", () => {
    for (const step of ["generating-actions", "analyzing-order"] as const) {
      assert.equal(copyOf({ ...source(), step }).step, "review-actions")
    }
  })

  it("leaves the original untouched, and produces a plan the database accepts", () => {
    const original = source()
    const before = JSON.stringify(original)
    const copy = copyOf(original)
    assert.equal(JSON.stringify(original), before)
    assert.equal(draftToPayload(copy).ok, true)
  })
})
