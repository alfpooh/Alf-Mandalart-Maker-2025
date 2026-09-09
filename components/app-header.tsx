"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { AccountMenu } from "@/components/account-menu"
import { LanguageSelector } from "@/components/language-selector"
import { isBusy, subscribeBusy } from "@/lib/busy"
import { useLanguage } from "@/lib/language-context"
import type { SessionInfo } from "@/lib/plans"

/**
 * The bar every screen shares.
 *
 * Before this, the only route back to the beginning was a button on the final
 * screen — and it deleted the plan on the way. Anyone part-way through had no
 * way out except the browser's back button. Starting a new Mandalart is now
 * reachable from anywhere, and it keeps what is already written: drafts are
 * listed on the home screen, so leaving one is not losing it.
 */
export function AppHeader({ session }: { session: SessionInfo }) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useLanguage()
  const [mounted, setMounted] = useState(false)

  const busy = useSyncExternalStore(
    subscribeBusy,
    isBusy,
    () => false, // the server never has a run in progress
  )

  // The link is only meaningful once the client has taken over.
  useEffect(() => setMounted(true), [])

  const onHome = pathname === "/"

  const startNew = () => {
    // Leaving mid-run abandons calls already made, which for an anonymous
    // visitor is most of the day's allowance. Worth one question.
    if (busy && !window.confirm(t("header.confirmLeave"))) return
    router.push("/")
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
        <Link
          href="/"
          className="min-w-0 shrink truncate text-sm font-semibold text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t("header.title")}
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {mounted && !onHome && (
            <button
              type="button"
              onClick={startNew}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t("header.newPlan")}</span>
              <span className="sr-only sm:hidden">{t("header.newPlan")}</span>
            </button>
          )}

          <AccountMenu session={session} />
          <LanguageSelector />
        </div>
      </div>
    </header>
  )
}
