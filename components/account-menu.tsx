"use client"

import { LogIn, LogOut } from "lucide-react"

import { signInWithGoogle, signOut } from "@/lib/auth-actions"
import { useLanguage } from "@/lib/language-context"
import type { SessionInfo } from "@/lib/plans"

/**
 * Sign in, or who is signed in.
 *
 * Renders nothing when Supabase is unconfigured — offering an account button
 * that cannot work is worse than not offering one.
 */
export function AccountMenu({ session }: { session: SessionInfo }) {
  const { t } = useLanguage()
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
      <span className="max-w-[12rem] truncate text-sm text-muted-foreground">
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
