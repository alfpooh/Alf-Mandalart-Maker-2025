"use client"

import Link from "next/link"
import { Trash2 } from "lucide-react"

import { deleteDraft } from "@/lib/store/local-drafts"
import { useLanguage } from "@/lib/language-context"
import { draftActions, TOTAL_ACTIONS, type EditorDraft } from "@/lib/types"

interface RecentDraftsProps {
  drafts: EditorDraft[]
  onDeleted: () => void
}

/**
 * Mandalarts still in the browser.
 *
 * Nothing used to survive a refresh, so there was no way back to work in
 * progress. These are local-only and cleared after 24 hours — the same window
 * anonymous drafts get on the server once accounts land.
 */
export function RecentDrafts({ drafts, onDeleted }: RecentDraftsProps) {
  const { t } = useLanguage()

  return (
    <section className="bg-border px-4 pb-16">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">
          {t("drafts.title")}
        </h2>

        <ul className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {drafts.map((draft) => {
            const filled = draftActions(draft).length
            return (
              <li key={draft.id} className="flex items-center gap-3 p-4">
                <Link href={`/plan/${draft.id}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate font-medium text-gray-800">
                    {draft.mainGoal}
                  </span>
                  <span className="mt-0.5 block text-sm tabular-nums text-gray-500">
                    {filled} / {TOTAL_ACTIONS} · {t(`drafts.step.${draft.step}`)}
                  </span>
                </Link>

                <button
                  onClick={() => {
                    deleteDraft(draft.id)
                    onDeleted()
                  }}
                  className="flex-none rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  aria-label={`${t("drafts.delete")}: ${draft.mainGoal}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>

        <p className="mt-3 text-xs text-gray-500">{t("drafts.note")}</p>
      </div>
    </section>
  )
}
