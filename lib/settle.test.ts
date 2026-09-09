/**
 * Tests for the guard around a server action result that never arrived.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { settle } from "./settle.ts"

describe("settle", () => {
  it("passes a success through untouched", () => {
    const ok = { ok: true as const, data: [1, 2] }
    assert.equal(settle(ok), ok)
  })

  it("passes a failure through untouched, keeping its own message", () => {
    const failed = { ok: false as const, error: "quota.anonExhausted" }
    assert.equal(settle(failed), failed)
    assert.equal(settle(failed).error, "quota.anonExhausted")
  })

  it("turns undefined into a failure instead of letting .ok throw", () => {
    // This is the whole point: before the guard, reading .ok off the missing
    // result was an unhandled TypeError that blanked the page.
    const result = settle(undefined)
    assert.equal(result.ok, false)
    assert.doesNotThrow(() => result.ok)
  })

  it("reports a translation key, so the UI can say to reload", () => {
    const result = settle(undefined)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error, "app.stale")
  })

  it("does not mistake a falsy-but-present failure for a missing one", () => {
    const failed = { ok: false as const, error: "" }
    assert.equal(settle(failed), failed)
  })
})
