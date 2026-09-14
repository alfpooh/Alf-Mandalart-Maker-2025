"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutGrid, LogIn, LogOut } from "lucide-react"

import { signInWithGoogle, signOut } from "@/lib/auth-actions"
import { useLanguage } from "@/lib/language-context"
import type { SessionInfo } from "@/lib/plans"

/**
 * Sign in, or the way back to your Mandalarts and out again.
 *
 * Renders nothing when Supabase is unconfigured — offering an account button
 * that cannot work is worse than not offering one.
 */
export function AccountMenu({ session }: { session: SessionInfo }) {
  const { t } = useLanguage()
  const pathname = usePathname()
  if (!session.configured) return null

  if (!session.signedIn) {
    return (
      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          {t("auth.signIn")}
        </button>
      </form>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/dashboard"
        aria-current={pathname === "/dashboard" ? "page" : undefined}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:bg-muted"
      >
        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t("header.dashboard")}</span>
        <span className="sr-only sm:hidden">{t("header.dashboard")}</span>
      </Link>
      {/* The name gives way on narrow screens, where the bar would otherwise wrap. */}
      <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground md:inline">
        {session.displayName ?? session.email}
      </span>
      <form action={signOut}>
        <button
          type="submit"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label={t("auth.signOut")}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}
