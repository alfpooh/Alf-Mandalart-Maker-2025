/**
 * Tests for what the browser keeps and what it clears.
 *
 * What these protect: the 24-hour cleanup never deletes a copy that has
 * reached an account — one still holding an unsaved change would lose it for
 * good — and the stored draft token can be matched to the plan it belongs to.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import {
  cacheDraft,
  listDrafts,
  purgeExpiredDrafts,
  readDraftTokenEntry,
  saveDraftToken,
} from "./local-drafts.ts"
import type { EditorDraft } from "../types.ts"

/** Just enough of Storage for local-drafts, which reads `window.localStorage`. */
class MemoryStorage {
  private items = new Map<string, string>()
  getItem(key: string) {
    return this.items.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value))
  }
  removeItem(key: string) {
    this.items.delete(key)
  }
  clear() {
    this.items.clear()
  }
}

const store = new MemoryStorage()
// Each test file runs in its own process, so this global stays local to it.
;(globalThis as { window?: unknown }).window = { localStorage: store }

const DAY_MS = 24 * 60 * 60 * 1000
const twoDaysAgo = () => new Date(Date.now() - 2 * DAY_MS).toISOString()

function draft(id: string, overrides: Partial<EditorDraft> = {}): EditorDraft {
  return {
    id,
    mainGoal: "goal",
    language: "en",
    step: "review-subgoals",
    subgoals: [],
    actions: {},
    dependencies: [],
    createdAt: twoDaysAgo(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => store.clear())

describe("purgeExpiredDrafts", () => {
  it("clears an old draft that never reached an account", () => {
    cacheDraft(draft("old", { updatedAt: twoDaysAgo() }))
    purgeExpiredDrafts()
    assert.deepEqual(listDrafts(), [])
  })

  it("keeps a recent draft", () => {
    cacheDraft(draft("recent"))
    purgeExpiredDrafts()
    assert.deepEqual(listDrafts().map((d) => d.id), ["recent"])
  })

  it("keeps an old copy that reached an account, including one with an unsaved change", () => {
    const synced = twoDaysAgo()
    cacheDraft(draft("synced", { updatedAt: synced, serverSyncedAt: synced, pendingSync: false }))
    cacheDraft(draft("pending", { updatedAt: synced, serverSyncedAt: synced, pendingSync: true }))
    purgeExpiredDrafts()
    assert.deepEqual(listDrafts().map((d) => d.id).sort(), ["pending", "synced"])
  })
})

describe("readDraftTokenEntry", () => {
  it("returns the token together with the plan it belongs to", () => {
    saveDraftToken("plan-1", "token-1")
    assert.deepEqual(readDraftTokenEntry(), { planId: "plan-1", token: "token-1" })
  })

  it("returns null when nothing usable is stored", () => {
    assert.equal(readDraftTokenEntry(), null)
    store.setItem("mandalart.draftToken", "{not json")
    assert.equal(readDraftTokenEntry(), null)
    store.setItem("mandalart.draftToken", JSON.stringify({ token: "no plan" }))
    assert.equal(readDraftTokenEntry(), null)
  })
})
