"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { claimDraft } from "@/lib/plans"
import { useLanguage } from "@/lib/language-context"
import { clearDraftToken, readDraftToken } from "@/lib/store/local-drafts"

/**
 * Runs straight after sign-in: hands the anonymous draft to the new account.
 *
 * A client page because the draft token lives in the browser. If there is no
 * token the user simply signed in without a plan in progress, which is not an
 * error — send them home.
 */
export default function ClaimPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = readDraftToken()
    if (!token) {
      router.replace("/")
      return
    }

    let cancelled = false
    claimDraft(token).then((result) => {
      if (cancelled) return
      if (result.ok && result.planId) {
        clearDraftToken()
        router.replace(`/plan/${result.planId}`)
      } else {
        // The local copy is untouched, so nothing is lost — say so plainly.
        setError(result.error ?? "plan.claimFailed")
      }
    })
    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      {error ? (
        <>
          <h1 className="text-xl font-bold">{t("auth.claimFailed")}</h1>
          <p className="max-w-md text-muted-foreground">{t(error)}</p>
          <button
            onClick={() => router.replace("/")}
            className="mt-2 min-h-[44px] rounded-lg bg-primary px-6 font-semibold text-primary-foreground"
          >
            {t("plan.notFound.start")}
          </button>
        </>
      ) : (
        <p className="text-muted-foreground" aria-live="polite">
          {t("auth.claiming")}
        </p>
      )}
    </div>
  )
}
