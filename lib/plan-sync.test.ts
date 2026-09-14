/**
 * Tests for moving a plan between the browser and the database.
 *
 * What these protect: a save never writes something the database will refuse
 * halfway through, a plan read back is the plan that was saved, and opening a
 * plan never lets a stale copy overwrite newer work.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  chooseInitialDraft,
  draftToPayload,
  isUuid,
  rowsToDraft,
  type PlanPayload,
  type PlanRows,
} from "./plan-sync.ts"
import type { ActionDependency, EditorCell, EditorDraft } from "./types.ts"

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

function cell(id: string, content: string, metric: string | null = null, confirmed = true): EditorCell {
  return { id, content, metric, isConfirmed: confirmed, isEditing: false }
}

function draft(overrides: Partial<EditorDraft> = {}): EditorDraft {
  return {
    id: u(1),
    mainGoal: "하프 마라톤 완주",
    language: "ko",
    step: "review-actions",
    subgoals: [cell(u(10), "달리기"), cell(u(11), "근력", null, false)],
    actions: {
      [u(10)]: [cell(u(100), "주 3회 조깅", "30분"), cell(u(101), "10km 대회", null, false)],
      [u(11)]: [cell(u(110), "스쿼트", "주 2회")],
    },
    dependencies: [
      { actionId: u(101), dependsOnId: u(100), rationale: "먼저", confidence: 0.9, userEdited: true },
    ],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  }
}

function payloadOf(d: EditorDraft): PlanPayload {
  const result = draftToPayload(d)
  assert.equal(result.ok, true, `expected a payload, got ${JSON.stringify(result)}`)
  return (result as { ok: true; payload: PlanPayload }).payload
}

/** The rows the database would hold after saving this payload. */
function rowsFrom(payload: PlanPayload, planId: string): PlanRows {
  return {
    plan: {
      id: planId,
      main_goal: payload.mainGoal,
      language: payload.language,
      step: payload.step,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-02T00:00:00.000Z",
      last_activity_at: "2026-09-03T00:00:00.000Z",
    },
    // Reversed, so the tests prove order comes from position, not row order.
    subgoals: payload.subgoals.map((s) => ({ ...s })).reverse(),
    actions: payload.actions
      .map((a) => ({
        id: a.id,
        subgoal_id: a.subgoalId,
        position: a.position,
        content: a.content,
        metric: a.metric,
        confirmed: a.confirmed,
      }))
      .reverse(),
    dependencies: payload.dependencies.map((d) => ({
      action_id: d.actionId,
      depends_on_id: d.dependsOnId,
      rationale: d.rationale,
      confidence: d.confidence,
      user_edited: d.userEdited,
    })),
  }
}

describe("isUuid", () => {
  it("accepts a uuid and refuses the ids older builds produced", () => {
    assert.equal(isUuid(u(1)), true)
    assert.equal(isUuid(crypto.randomUUID()), true)
    assert.equal(isUuid("regen-test"), false)
    assert.equal(isUuid("dlz3k9f2a8c1b7e4"), false)
    assert.equal(isUuid(null), false)
  })
})

describe("draftToPayload", () => {
  it("carries ids, positions, content, metrics and confirmed flags", () => {
    const p = payloadOf(draft())
    assert.deepEqual(p.subgoals, [
      { id: u(10), position: 0, content: "달리기", confirmed: true },
      { id: u(11), position: 1, content: "근력", confirmed: false },
    ])
    assert.deepEqual(p.actions[1], {
      id: u(101),
      subgoalId: u(10),
      position: 1,
      content: "10km 대회",
      metric: null,
      confirmed: false,
    })
    assert.equal(p.actions[2].position, 0, "positions restart for each subgoal")
    assert.equal(p.step, "review-actions")
  })

  it("trims text and turns a blank metric into null", () => {
    const d = draft()
    d.mainGoal = "  완주  "
    d.actions[u(10)][0] = cell(u(100), "  조깅  ", "   ")
    const p = payloadOf(d)
    assert.equal(p.mainGoal, "완주")
    assert.equal(p.actions[0].content, "조깅")
    assert.equal(p.actions[0].metric, null)
  })

  it("leaves out a half-typed empty action instead of refusing the whole save", () => {
    const d = draft()
    d.actions[u(10)].splice(1, 0, cell(u(199), "   ", null, false))
    const p = payloadOf(d)
    assert.equal(p.actions.some((a) => a.id === u(199)), false)
    assert.deepEqual(
      p.actions.filter((a) => a.subgoalId === u(10)).map((a) => a.position),
      [0, 1],
      "no gap where the empty row was",
    )
  })

  it("drops edges that touch an action being left out", () => {
    const d = draft()
    d.dependencies.push({ actionId: u(199), dependsOnId: u(100), rationale: "", confidence: 1, userEdited: false })
    d.actions[u(10)].push(cell(u(199), ""))
    assert.equal(payloadOf(d).dependencies.length, 1)
  })

  it("keeps each edge once and never lets an action depend on itself", () => {
    const edge: ActionDependency = { actionId: u(101), dependsOnId: u(100), rationale: "", confidence: 2, userEdited: false }
    const d = draft({ dependencies: [edge, { ...edge }, { ...edge, dependsOnId: u(101) }] })
    const deps = payloadOf(d).dependencies
    assert.equal(deps.length, 1)
    assert.equal(deps[0].confidence, 1, "confidence is clamped to the column's range")
  })

  it("names why a draft cannot be saved yet", () => {
    assert.deepEqual(draftToPayload(draft({ id: "regen-test" })), { ok: false, reason: "not-server-plan" })
    assert.deepEqual(draftToPayload(draft({ mainGoal: "  " })), { ok: false, reason: "blank-main-goal" })

    const blank = draft()
    blank.subgoals[0] = cell(u(10), "   ")
    assert.deepEqual(draftToPayload(blank), { ok: false, reason: "blank-subgoal" })

    const long = draft()
    long.actions[u(10)][0] = cell(u(100), "가".repeat(301))
    assert.deepEqual(draftToPayload(long), { ok: false, reason: "too-long" })

    const legacy = draft()
    legacy.actions[u(10)][0] = cell("dlz3k9f2a8c1b7e4", "조깅")
    assert.deepEqual(draftToPayload(legacy), { ok: false, reason: "legacy-ids" })
  })

  it("refuses a repeated id, which the database would reject mid-save", () => {
    const d = draft()
    d.actions[u(11)][0] = cell(u(100), "중복")
    assert.deepEqual(draftToPayload(d), { ok: false, reason: "shape" })
  })

  it("refuses more cells than a Mandalart has", () => {
    const d = draft()
    d.actions[u(10)] = Array.from({ length: 9 }, (_, i) => cell(u(300 + i), `a${i}`))
    assert.deepEqual(draftToPayload(d), { ok: false, reason: "shape" })
  })
})

describe("rowsToDraft", () => {
  it("round-trips: what is saved is what comes back", () => {
    const original = draft()
    const back = rowsToDraft(rowsFrom(payloadOf(original), original.id))
    assert.ok(back)
    assert.deepEqual(back.subgoals, original.subgoals)
    assert.deepEqual(back.actions, original.actions)
    assert.deepEqual(
      back.dependencies.map((d) => [d.actionId, d.dependsOnId, d.userEdited]),
      [[u(101), u(100), true]],
    )
    assert.equal(back.step, original.step)
    assert.equal(back.mainGoal, original.mainGoal)
  })

  it("orders by position, not by the order rows arrive in", () => {
    const back = rowsToDraft(rowsFrom(payloadOf(draft()), u(1)))
    assert.deepEqual(back?.subgoals.map((s) => s.id), [u(10), u(11)])
    assert.deepEqual(back?.actions[u(10)].map((a) => a.id), [u(100), u(101)])
  })

  it("marks the copy as in step with the server, and dates it by last activity", () => {
    const back = rowsToDraft(rowsFrom(payloadOf(draft()), u(1)))
    assert.equal(back?.pendingSync, false)
    assert.equal(back?.updatedAt, "2026-09-03T00:00:00.000Z")
    assert.equal(back?.serverSyncedAt, "2026-09-03T00:00:00.000Z")
  })

  it("returns null for a database without the migration, rather than a plan with nothing confirmed", () => {
    const rows = rowsFrom(payloadOf(draft()), u(1))
    delete rows.plan.step
    assert.equal(rowsToDraft(rows), null)
  })

  it("ignores actions and edges that point outside the plan", () => {
    const rows = rowsFrom(payloadOf(draft()), u(1))
    rows.actions.push({ id: u(900), subgoal_id: u(999), position: 0, content: "x", metric: null, confirmed: false })
    rows.dependencies.push({ action_id: u(900), depends_on_id: u(100), rationale: null, confidence: 1, user_edited: false })
    const back = rowsToDraft(rows)
    assert.equal(Object.values(back?.actions ?? {}).flat().some((a) => a.id === u(900)), false)
    assert.equal(back?.dependencies.length, 1)
  })
})

describe("chooseInitialDraft", () => {
  const server = rowsToDraft(rowsFrom(payloadOf(draft()), u(1)))!
  const emptyServer: EditorDraft = { ...server, subgoals: [], actions: {}, dependencies: [] }

  it("opens the server copy when the local one has nothing unsaved", () => {
    const local = { ...draft(), pendingSync: false }
    assert.equal(chooseInitialDraft(local, server).source, "server")
  })

  it("keeps and uploads local changes that never reached the server", () => {
    const local = { ...draft(), pendingSync: true }
    assert.deepEqual(chooseInitialDraft(local, server), { source: "local", draft: local, push: true })
  })

  it("never compares clocks: a local copy dated in the future still loses if it has nothing unsaved", () => {
    const local = { ...draft(), updatedAt: "2099-01-01T00:00:00.000Z", pendingSync: false }
    assert.equal(chooseInitialDraft(local, server).source, "server")
  })

  it("uploads a plan whose server row exists but has never been filled", () => {
    const local = { ...draft(), pendingSync: false }
    assert.deepEqual(chooseInitialDraft(local, emptyServer), { source: "local", draft: local, push: true })
  })

  it("falls back to the local copy when the server has nothing usable", () => {
    const local = draft()
    assert.deepEqual(chooseInitialDraft(local, null), { source: "local", draft: local, push: false })
  })

  it("opens the server copy on a device that has never seen the plan", () => {
    assert.equal(chooseInitialDraft(null, server).source, "server")
  })

  it("reports nothing to open when neither copy has content", () => {
    assert.deepEqual(chooseInitialDraft(null, null), { source: "none" })
    assert.deepEqual(chooseInitialDraft(null, emptyServer), { source: "none" })
  })
})
