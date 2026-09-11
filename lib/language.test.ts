/**
 * Tests for reading the chosen language off a request.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  DEFAULT_LANGUAGE,
  languageCookie,
  languageFromAcceptHeader,
  parseLanguage,
} from "./language.ts"

describe("parseLanguage", () => {
  it("accepts the three the app speaks", () => {
    assert.equal(parseLanguage("ko"), "ko")
    assert.equal(parseLanguage("en"), "en")
    assert.equal(parseLanguage("fi"), "fi")
  })

  it("tolerates case and surrounding space from a cookie", () => {
    assert.equal(parseLanguage(" KO "), "ko")
  })

  it("refuses anything else rather than guessing", () => {
    assert.equal(parseLanguage("de"), null)
    assert.equal(parseLanguage(""), null)
    assert.equal(parseLanguage(null), null)
    assert.equal(parseLanguage("ko; DROP TABLE"), null)
  })
})

describe("languageFromAcceptHeader", () => {
  it("takes a regional tag down to its base language", () => {
    assert.equal(languageFromAcceptHeader("ko-KR,ko;q=0.9"), "ko")
  })

  it("honours quality order rather than position", () => {
    assert.equal(languageFromAcceptHeader("de;q=0.9,fi;q=1.0"), "fi")
  })

  it("skips languages this app does not have", () => {
    assert.equal(languageFromAcceptHeader("de-DE,fr;q=0.8,en;q=0.5"), "en")
  })

  it("returns null when nothing matches, so the caller picks the default", () => {
    assert.equal(languageFromAcceptHeader("de,fr"), null)
    assert.equal(languageFromAcceptHeader(null), null)
  })
})

describe("languageCookie", () => {
  it("is a year-long preference scoped to the whole site", () => {
    const cookie = languageCookie("fi")
    assert.match(cookie, /^mandalart-language=fi;/)
    assert.match(cookie, /Path=\//)
    assert.match(cookie, /Max-Age=31536000/)
    assert.match(cookie, /SameSite=Lax/)
  })
})

describe("DEFAULT_LANGUAGE", () => {
  it("is one the app speaks", () => {
    assert.equal(parseLanguage(DEFAULT_LANGUAGE), DEFAULT_LANGUAGE)
  })
})
