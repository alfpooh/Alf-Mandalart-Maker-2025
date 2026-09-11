/**
 * Tests for the guard around a server action result that never arrived.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { settle, settled } from "./settle.ts"

/** The shape these actions actually return. */
type Result = { ok: true; data: string } | { ok: false; error: string }

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
    const result = settle<Result>(undefined)
    assert.equal(result.ok, false)
    assert.doesNotThrow(() => result.ok)
  })

  it("reports a translation key, so the UI can say to reload", () => {
    const result = settle<Result>(undefined)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error, "app.stale")
  })

  it("does not mistake a falsy-but-present failure for a missing one", () => {
    const failed = { ok: false as const, error: "" }
    assert.equal(settle(failed), failed)
  })
})

describe("settled", () => {
  it("passes a result through", async () => {
    const ok = { ok: true as const, data: 1 }
    assert.equal(await settled(Promise.resolve(ok)), ok)
  })

  it("turns a missing result into a failure", async () => {
    const result = await settled<Result>(Promise.resolve(undefined))
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error, "app.stale")
  })

  it("turns a rejection into a failure instead of abandoning the batch", async () => {
    // A rejection inside Promise.all used to strand a plan mid-generation.
    const result = await settled<Result>(Promise.reject(new TypeError("Failed to fetch")))
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error, "app.offline")
  })

  it("never rejects, whatever it is given", async () => {
    await assert.doesNotReject(() => settled<Result>(Promise.reject("plain string")))
  })
})
