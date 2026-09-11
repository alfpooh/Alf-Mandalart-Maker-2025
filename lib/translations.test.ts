/**
 * Tests for the translation resources themselves.
 *
 * A key present in one language and missing in another shows up as the raw key
 * on screen — the kind of half-translated UI this file exists to prevent. These
 * run on every `npm test`, so a key added to English alone fails immediately
 * rather than at whatever moment a Finnish reader opens that screen.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import translations from "./translations.json" with { type: "json" }
import { LANGUAGES } from "./types.ts"

type Tree = { [key: string]: string | Tree }

function leaves(node: Tree, prefix = ""): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === "string" ? [path] : leaves(value, path)
  })
}

function valueAt(node: Tree, path: string): string | Tree | undefined {
  return path.split(".").reduce<string | Tree | undefined>(
    (current, part) =>
      current && typeof current === "object" ? current[part] : undefined,
    node,
  )
}

const byLanguage = translations as unknown as Record<string, Tree>
const keys = Object.fromEntries(
  LANGUAGES.map((lang) => [lang, new Set(leaves(byLanguage[lang]))]),
) as Record<string, Set<string>>

describe("translations.json", () => {
  it("covers every language the app offers", () => {
    for (const lang of LANGUAGES) {
      assert.ok(byLanguage[lang], `no translations for ${lang}`)
    }
  })

  it("has exactly the same keys in every language", () => {
    const [first, ...rest] = LANGUAGES
    for (const lang of rest) {
      const missing = [...keys[first]].filter((k) => !keys[lang].has(k))
      const extra = [...keys[lang]].filter((k) => !keys[first].has(k))
      assert.deepEqual(missing, [], `${lang} is missing: ${missing.join(", ")}`)
      assert.deepEqual(extra, [], `${lang} has keys ${first} lacks: ${extra.join(", ")}`)
    }
  })

  it("has no empty strings, which render as a blank label", () => {
    for (const lang of LANGUAGES) {
      for (const key of keys[lang]) {
        const value = valueAt(byLanguage[lang], key)
        assert.ok(
          typeof value === "string" && value.trim().length > 0,
          `${lang}.${key} is empty`,
        )
      }
    }
  })

  it("uses the same placeholders in every language", () => {
    // "Confirm action {n}" translated without its {n} silently drops the number.
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

    for (const key of keys.en) {
      const expected = placeholders(valueAt(byLanguage.en, key) as string)
      for (const lang of LANGUAGES) {
        assert.deepEqual(
          placeholders(valueAt(byLanguage[lang], key) as string),
          expected,
          `${lang}.${key} placeholders differ from en`,
        )
      }
    }
  })

  it("carries the strings the document metadata needs", () => {
    // layout.tsx reads these directly rather than through the React context.
    for (const lang of LANGUAGES) {
      assert.equal(typeof valueAt(byLanguage[lang], "app.title"), "string")
      assert.equal(typeof valueAt(byLanguage[lang], "app.description"), "string")
    }
  })
})
