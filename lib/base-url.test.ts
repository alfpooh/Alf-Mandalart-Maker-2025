/**
 * Tests for the OAuth return address.
 *
 * These exist because the bug they cover was invisible until after the account
 * picker, by which point the sign-in was already spent.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { baseUrlFrom } from "./base-url.ts"

const headers = (map: Record<string, string>) => ({
  get: (name: string) => map[name.toLowerCase()] ?? null,
})

describe("baseUrlFrom", () => {
  it("prefers origin, which already carries a scheme", () => {
    assert.equal(
      baseUrlFrom(headers({ origin: "https://example.com", host: "internal:8080" })),
      "https://example.com",
    )
  })

  it("keeps a dev server on http when falling back to a bare host", () => {
    // The regression: prefixing https here sent the browser into a TLS
    // handshake no dev server answers — ERR_SSL_PROTOCOL_ERROR.
    assert.equal(baseUrlFrom(headers({ host: "localhost:3000" })), "http://localhost:3000")
    assert.equal(baseUrlFrom(headers({ host: "127.0.0.1:10000" })), "http://127.0.0.1:10000")
    assert.equal(baseUrlFrom(headers({ host: "[::1]:3000" })), "http://[::1]:3000")
    assert.equal(baseUrlFrom(headers({ host: "app.localhost:3000" })), "http://app.localhost:3000")
  })

  it("assumes https for a real host, which is how it is served", () => {
    assert.equal(
      baseUrlFrom(headers({ "x-forwarded-host": "alf-mandalart-maker.onrender.com" })),
      "https://alf-mandalart-maker.onrender.com",
    )
  })

  it("believes the proxy over the guess", () => {
    assert.equal(
      baseUrlFrom(headers({ host: "example.com", "x-forwarded-proto": "http" })),
      "http://example.com",
    )
  })

  it("takes the first entry when a chain of proxies each appended one", () => {
    assert.equal(
      baseUrlFrom(headers({ host: "example.com", "x-forwarded-proto": "https, http" })),
      "https://example.com",
    )
  })

  it("prefers x-forwarded-host over host, since that is the public name", () => {
    assert.equal(
      baseUrlFrom(headers({ host: "10.0.0.4:8080", "x-forwarded-host": "example.com" })),
      "https://example.com",
    )
  })

  it("returns null rather than building a URL out of nothing", () => {
    // The old code produced the string "https://null" and redirected there.
    assert.equal(baseUrlFrom(headers({})), null)
  })

  it("ignores an origin that is not a URL", () => {
    // Browsers send `Origin: null` for some cross-origin and sandboxed cases.
    assert.equal(baseUrlFrom(headers({ origin: "null", host: "localhost:3000" })), "http://localhost:3000")
  })

  it("drops a trailing slash so the path is not doubled", () => {
    assert.equal(baseUrlFrom(headers({ origin: "https://example.com/" })), "https://example.com")
  })
})
