/**
 * Tests for the generation limit.
 *
 * The parts that talk to the database are not covered here — these cover the
 * decisions: how a client is identified, what the stored value reveals, and
 * when a request is refused.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { clientIp, fingerprint, today, verdict } from "./quota.ts"
import { ANON_DAILY_LIMIT, USER_DAILY_LIMIT } from "./supabase/config.ts"

describe("fingerprint", () => {
  it("is stable for the same address and salt", () => {
    assert.equal(fingerprint("203.0.113.7", "s"), fingerprint("203.0.113.7", "s"))
  })

  it("separates different addresses", () => {
    assert.notEqual(fingerprint("203.0.113.7", "s"), fingerprint("203.0.113.8", "s"))
  })

  it("changes completely with the salt — an unsalted hash of an IP is reversible", () => {
    assert.notEqual(fingerprint("203.0.113.7", "a"), fingerprint("203.0.113.7", "b"))
  })

  it("never contains the address it was made from", () => {
    const hash = fingerprint("203.0.113.7", "salt")
    assert.ok(!hash.includes("203"))
    assert.match(hash, /^[0-9a-f]{32}$/)
  })
})

describe("clientIp", () => {
  it("takes the leftmost entry of x-forwarded-for — the rest are proxies", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" })
    assert.equal(clientIp(headers), "203.0.113.7")
  })

  it("trims surrounding space", () => {
    assert.equal(clientIp(new Headers({ "x-forwarded-for": "  203.0.113.7  " })), "203.0.113.7")
  })

  it("falls back to x-real-ip", () => {
    assert.equal(clientIp(new Headers({ "x-real-ip": "198.51.100.4" })), "198.51.100.4")
  })

  it("prefers x-forwarded-for when both are present", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7",
      "x-real-ip": "198.51.100.4",
    })
    assert.equal(clientIp(headers), "203.0.113.7")
  })

  it("returns null when neither header is set", () => {
    assert.equal(clientIp(new Headers()), null)
  })

  it("returns null for an empty x-forwarded-for rather than an empty string", () => {
    assert.equal(clientIp(new Headers({ "x-forwarded-for": "" })), null)
  })
})

describe("today", () => {
  it("is the UTC date, matching the quota table's day column", () => {
    assert.equal(today(new Date("2026-09-07T23:30:00Z")), "2026-09-07")
    assert.equal(today(new Date("2026-09-08T00:30:00Z")), "2026-09-08")
  })
})

describe("verdict", () => {
  // Written against the configured limit rather than a number, so changing
  // the allowance does not silently turn these into assertions about nothing.
  it("allows an anonymous visitor up to the limit and refuses the next", () => {
    assert.equal(verdict(0, false).allowed, true)
    assert.equal(verdict(ANON_DAILY_LIMIT - 1, false).allowed, true)
    assert.equal(verdict(ANON_DAILY_LIMIT, false).allowed, false)
    assert.equal(verdict(ANON_DAILY_LIMIT, false).reason, "quota.anonExhausted")
  })

  it("gives signed-in accounts a higher ceiling", () => {
    assert.equal(verdict(ANON_DAILY_LIMIT, true).allowed, true)
    assert.ok(USER_DAILY_LIMIT > ANON_DAILY_LIMIT)
    assert.ok(verdict(0, true).limit > verdict(0, false).limit)
  })

  it("refuses a count already past the limit", () => {
    const past = Math.max(ANON_DAILY_LIMIT, USER_DAILY_LIMIT) + 1
    assert.equal(verdict(past, false).allowed, false)
    assert.equal(verdict(past, true).allowed, false)
    assert.equal(verdict(past, true).reason, "quota.userExhausted")
  })

  it("reports the count so the UI can say how many are left", () => {
    assert.equal(verdict(3, true).used, 3)
  })
})
