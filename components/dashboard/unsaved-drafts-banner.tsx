"use client"

import { useEffect, useState } from "react"
import { CloudUpload } from "lucide-react"

import { importLocalDraft } from "@/lib/dashboard"
import { useLanguage } from "@/lib/language-context"
import { unsavedLocalDrafts, type PlanSummary, type UnsavedDraft } from "@/lib/plan-summary"
import { claimDraft, savePlan } from "@/lib/plans"
import { settled } from "@/lib/settle"
import {
  cacheDraft,
  clearDraftToken,
  deleteDraft,
  listDrafts,
  markSynced,
  readDraftTokenEntry,
} from "@/lib/store/local-drafts"
import type { EditorDraft } from "@/lib/types"

/** How many goals the banner names before the count has to speak for the rest. */
const NAMED = 5

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"

/**
 * Mandalarts in this browser that the account does not have.
 *
 * Only this browser knows about them, so they are invisible from any other
 * device, and an anonymous draft is gone after 24 hours. Saving one never
 * spends generation quota: the content already exists.
 */
export function UnsavedDraftsBanner({
  plans,
  onSaved,
}: {
  plans: PlanSummary[]
  onSaved: () => Promise<void>
}) {
  const { t } = useLanguage()
  const [unsaved, setUnsaved] = useState<UnsavedDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [outcome, setOutcome] = useState<{ saved: number; failed: number } | null>(null)

  // Storage exists only in the browser, so these are found after mount — and
  // found again whenever the account's list changes, so a saved one drops off.
  useEffect(() => {
    setUnsaved(unsavedLocalDrafts(listDrafts(), plans))
  }, [plans])

  if (unsaved.length === 0 && !outcome) return null

  const saveAll = async () => {
    setSaving(true)
    setOutcome(null)
    let saved = 0
    let failed = 0
    // One at a time: each may move a local copy to a new id, and the next
    // one's lookup should see that.
    for (const item of unsaved) {
      if (await saveOne(item)) saved += 1
      else failed += 1
    }
    setOutcome({ saved, failed })
    await onSaved()
    setSaving(false)
  }

  const allSaved = outcome !== null && outcome.failed === 0

  return (
    <section
      aria-labelledby={unsaved.length > 0 ? "unsaved-drafts-title" : undefined}
      className={`mt-6 rounded-lg border p-4 ${
        allSaved && unsaved.length === 0
          ? "border-emerald-300 bg-emerald-50"
          : "border-amber-300 bg-amber-50"
      }`}
    >
      {unsaved.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <CloudUpload className="hidden h-5 w-5 flex-none text-amber-800 sm:block" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id="unsaved-drafts-title" className="font-semibold text-amber-950">
              {t("dashboard.unsaved.title", { n: unsaved.length })}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-amber-900">{t("dashboard.unsaved.body")}</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-amber-950">
              {unsaved.slice(0, NAMED).map(({ draft }) => (
                <li key={draft.id} className="break-words">
                  {draft.mainGoal}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={saveAll}
            disabled={saving}
            className={`min-h-[44px] flex-none rounded-md bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60 ${FOCUS}`}
          >
            {saving ? t("dashboard.unsaved.saving") : t("dashboard.unsaved.save")}
          </button>
        </div>
      )}

      <p
        role="status"
        className={
          outcome
            ? `text-sm font-medium ${unsaved.length > 0 ? "mt-3 text-amber-950" : "text-emerald-900"}`
            : "sr-only"
        }
      >
        {outcome &&
          (outcome.failed > 0
            ? t("dashboard.unsaved.partial", { failed: outcome.failed })
            : t("dashboard.unsaved.saved", { n: outcome.saved }))}
      </p>
    </section>
  )
}

/** Sends one draft. True when the account now holds its content. */
async function saveOne({ draft, kind }: UnsavedDraft): Promise<boolean> {
  if (kind === "upload") return upload(draft)

  // The draft this browser started anonymously is claimed with its token,
  // which keeps its id and takes it off the anonymous 24-hour clock.
  const entry = readDraftTokenEntry()
  if (entry?.planId === draft.id) {
    const claimed = await settled(claimDraft(entry.token))
    if (claimed.ok) {
      clearDraftToken()
      return upload(draft)
    }
  }

  const result = await settled(importLocalDraft(draft))
  if (!result.ok) return false

  if (result.planId === draft.id) {
    markSynced(draft.id, draft.updatedAt, result.savedAt)
  } else {
    // Saved under a new id: the local copy moves with it, so the editor finds
    // it at the address the account knows.
    deleteDraft(draft.id)
    cacheDraft({ ...draft, id: result.planId, pendingSync: false, serverSyncedAt: result.savedAt })
  }
  return true
}

async function upload(draft: EditorDraft): Promise<boolean> {
  const result = await settled(savePlan(draft))
  if (result.ok) markSynced(draft.id, draft.updatedAt, result.savedAt)
  return result.ok
}
