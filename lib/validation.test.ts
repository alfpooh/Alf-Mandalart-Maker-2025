/**
 * Tests for the shared content check.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isBlank, normalizeCell, normalizeContent } from "./validation.ts"

describe("isBlank", () => {
  it("rejects a box holding only whitespace — the reported bug", () => {
    assert.equal(isBlank("   "), true)
    assert.equal(isBlank("\t\n  \r"), true)
    assert.equal(isBlank(""), true)
  })

  it("rejects nothing at all", () => {
    assert.equal(isBlank(null), true)
    assert.equal(isBlank(undefined), true)
  })

  it("accepts real text, including text that merely starts with a space", () => {
    assert.equal(isBlank("  운동하기"), false)
    assert.equal(isBlank("a"), false)
  })

  it("treats full-width and non-breaking space as whitespace", () => {
    // A Korean IME emits U+3000; a paste from a web page emits U+00A0. Both
    // look empty, and String.prototype.trim removes both.
    assert.equal(isBlank("　"), true)
    assert.equal(isBlank(" "), true)
  })
})

describe("normalizeContent", () => {
  it("strips the edges and leaves the middle alone", () => {
    assert.equal(normalizeContent("  주 3회 조깅  "), "주 3회 조깅")
    assert.equal(normalizeContent("a  b"), "a  b")
  })
})

describe("normalizeCell", () => {
  it("trims both fields", () => {
    const out = normalizeCell({ content: " run ", metric: " 5km " })
    assert.deepEqual(out, { content: "run", metric: "5km" })
  })

  it("turns a whitespace-only metric into null, not an empty string", () => {
    assert.equal(normalizeCell({ content: "run", metric: "   " }).metric, null)
    assert.equal(normalizeCell({ content: "run", metric: null }).metric, null)
  })

  it("keeps other fields untouched", () => {
    const out = normalizeCell({ content: " a ", metric: null, id: "x", isConfirmed: true })
    assert.equal(out.id, "x")
    assert.equal(out.isConfirmed, true)
  })
})
