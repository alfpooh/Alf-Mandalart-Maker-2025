/**
 * The chosen language, in a form the server can also read.
 *
 * It used to live only in localStorage, which the server cannot see, so every
 * response was rendered as English: `<html lang="en">` whatever the reader had
 * picked, an English <title> in the tab, and a visible flip to Korean or
 * Finnish once the effect ran. A cookie is sent with the request, so the first
 * byte can already be right.
 *
 * Importable from both sides — no React, no next/headers, no window.
 */

import { LANGUAGES, type Language } from "./types.ts"

export const LANGUAGE_COOKIE = "mandalart-language"

/** Also the localStorage key, kept from before so existing choices survive. */
export const LANGUAGE_STORAGE_KEY = "mandalart-language"

export const DEFAULT_LANGUAGE: Language = "en"

/** A value from a cookie, a header or storage — anything unrecognised is null. */
export function parseLanguage(value: string | null | undefined): Language | null {
  if (!value) return null
  const trimmed = value.trim().toLowerCase()
  return (LANGUAGES as string[]).includes(trimmed) ? (trimmed as Language) : null
}

/** First choice the browser lists that this app actually speaks. */
export function languageFromAcceptHeader(header: string | null | undefined): Language | null {
  if (!header) return null
  const tags = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";")
      const q = params.find((p) => p.trim().startsWith("q="))
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.split("=")[1]) : 1 }
    })
    .filter((entry) => entry.tag.length > 0 && !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q)

  for (const { tag } of tags) {
    // `ko-KR` and `ko` both mean Korean here.
    const base = parseLanguage(tag.split("-")[0])
    if (base) return base
  }
  return null
}

/** One year: this is a preference, not a session. */
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function languageCookie(language: Language): string {
  return `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE}; SameSite=Lax`
}
