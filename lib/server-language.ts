/**
 * The reader's language, resolved on the server.
 *
 * Separate from lib/language.ts because this half imports next/headers and so
 * cannot be pulled into a client component or a test.
 */

import { cookies, headers } from "next/headers"

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  languageFromAcceptHeader,
  parseLanguage,
} from "./language"
import type { Language } from "./types"

/**
 * Most specific wins: an explicit choice, then what the browser asks for, then
 * English. Falling straight to English meant a Korean reader's first page was
 * rendered in a language they had not asked for in any way.
 */
export async function resolveLanguage(): Promise<Language> {
  const chosen = parseLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value)
  if (chosen) return chosen

  const accepted = languageFromAcceptHeader((await headers()).get("accept-language"))
  return accepted ?? DEFAULT_LANGUAGE
}
