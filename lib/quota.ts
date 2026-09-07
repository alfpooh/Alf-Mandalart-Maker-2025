/**
 * Generation limits.
 *
 * Anonymous visitors get one Mandalart a day. That has to be enforced on the
 * server: a browser-side count is defeated by one private window, and a single
 * plan costs roughly 17 model calls (1 subgoal + 8 action + 8 dependency), so
 * an open door is an open bill.
 *
 * The client IP is never stored. It is hashed with a server-side salt, and the
 * hash is what the quota table keys on — enough to count repeat visitors,
 * useless for identifying one.
 */

import { createHash } from "node:crypto"

import { ANON_DAILY_LIMIT, USER_DAILY_LIMIT } from "./supabase/config.ts"

export interface QuotaVerdict {
  allowed: boolean
  /** Generations already used today. */
  used: number
  limit: number
  /** Translation key describing why it was refused. */
  reason?: "quota.anonExhausted" | "quota.userExhausted"
}

/**
 * Salted hash of a client IP.
 *
 * Without a salt the hash of an IPv4 address is trivially reversible — the
 * whole space is four billion entries, which is minutes of work. The salt is
 * what makes the stored value meaningless on its own.
 */
export function fingerprint(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32)
}

/**
 * The client IP, read from the proxy headers Vercel and most hosts set.
 *
 * Returns null when no header is present, which the caller treats as "cannot
 * identify" — see `quotaFor`.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    // Leftmost entry is the original client; the rest are proxies.
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return headers.get("x-real-ip") ?? null
}

/** Today in UTC, as the quota table's `day` column stores it. */
export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Decides from a count that has already been read. Pure, so it can be tested. */
export function verdict(used: number, signedIn: boolean): QuotaVerdict {
  const limit = signedIn ? USER_DAILY_LIMIT : ANON_DAILY_LIMIT
  return used >= limit
    ? {
        allowed: false,
        used,
        limit,
        reason: signedIn ? "quota.userExhausted" : "quota.anonExhausted",
      }
    : { allowed: true, used, limit }
}
