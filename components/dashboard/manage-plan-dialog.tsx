"use client"

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react"
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Copy,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  countPlanReports,
  deletePlan,
  duplicatePlan,
  renamePlan,
  setPlanCompleted,
  setPlansArchived,
} from "@/lib/dashboard"
import { useLanguage } from "@/lib/language-context"
import { cleanGoalName, confirmsGoal, copyName, type PlanSummary } from "@/lib/plan-summary"
import { settled } from "@/lib/settle"
import { cacheDraft, deleteDraft, loadDraft } from "@/lib/store/local-drafts"

export type ManageOutcome =
  /**
   * The plan still exists; the list is re-read to show where it now belongs.
   * `patch` is applied first, so the card agrees with the message at once
   * instead of a second later when the list arrives.
   */
  | { kind: "changed"; message: string; patch?: { id: string; changes: Partial<PlanSummary> } }
  | { kind: "deleted"; id: string; message: string }

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"

interface ManagePlanDialogProps {
  plan: PlanSummary | null
  onClose: () => void
  onDone: (outcome: ManageOutcome) => void
}

/**
 * Everything that can be done to a whole plan, in one keyboard-reachable place.
 *
 * Deleting is a second step inside the dialog rather than a button beside the
 * others: it says how many progress reports go with the plan, offers archiving
 * instead, and waits for the goal to be typed back.
 */
export function ManagePlanDialog({ plan, onClose, onDone }: ManagePlanDialogProps) {
  const { t } = useLanguage()
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [reports, setReports] = useState<number | null>(null)
  const [typed, setTyped] = useState("")

  // Opening the dialog for another plan starts from a clean slate.
  useEffect(() => {
    setName(plan?.mainGoal ?? "")
    setBusy(false)
    setError(null)
    setDeleting(false)
    setReports(null)
    setTyped("")
    // Keyed on the plan, not its name: a rename must not wipe what is typed.
  }, [plan?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async <T extends { ok: boolean }>(
    call: () => Promise<T>,
    done: (result: T) => void,
  ): Promise<void> => {
    setBusy(true)
    setError(null)
    const result = await settled(call())
    setBusy(false)
    if (result.ok) done(result as T)
    else setError(t((result as { error: string }).error))
  }

  if (!plan) return <Dialog open={false} />

  const archived = plan.status === "archived"
  const completed = plan.status === "completed"
  const newName = cleanGoalName(name)

  const rename = (event: FormEvent) => {
    event.preventDefault()
    if (!newName || newName === plan.mainGoal) return
    void run(
      () => renamePlan(plan.id, newName),
      () => {
        // A local copy holding an unsaved change would send the old name back
        // with its next save.
        const local = loadDraft(plan.id)
        if (local) cacheDraft({ ...local, mainGoal: newName })
        onDone({
          kind: "changed",
          message: t("dashboard.done.renamed"),
          patch: { id: plan.id, changes: { mainGoal: newName } },
        })
      },
    )
  }

  const toggleCompleted = () =>
    run(
      () => setPlanCompleted(plan.id, !completed),
      () =>
        onDone({
          kind: "changed",
          message: t(completed ? "dashboard.done.reopened" : "dashboard.done.completed"),
        }),
    )

  const toggleArchived = () =>
    run(
      () => setPlansArchived([plan.id], !archived),
      () =>
        onDone({
          kind: "changed",
          message: t(archived ? "dashboard.done.restored" : "dashboard.done.archived", { n: 1 }),
        }),
    )

  const duplicate = () =>
    run(
      () => duplicatePlan(plan.id, copyName(plan.mainGoal, t("dashboard.manage.copyName"))),
      () => onDone({ kind: "changed", message: t("dashboard.done.duplicated") }),
    )

  const startDeleting = async () => {
    setDeleting(true)
    setReports(null)
    setTyped("")
    setError(null)
    const result = await settled(countPlanReports(plan.id))
    if (result.ok) setReports(result.reports)
    else setError(t(result.error))
  }

  const confirmDelete = () =>
    run(
      () => deletePlan(plan.id, typed),
      () => {
        deleteDraft(plan.id)
        onDone({ kind: "deleted", id: plan.id, message: t("dashboard.done.deleted") })
      },
    )

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {deleting ? t("dashboard.delete.title") : t("dashboard.manage.title")}
          </DialogTitle>
          <DialogDescription className="break-words">{plan.mainGoal}</DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {deleting ? (
          <div className="grid gap-4">
            <p className="text-sm leading-relaxed text-gray-700" aria-live="polite">
              {reports === null
                ? t("dashboard.delete.counting")
                : t("dashboard.delete.body", { reports })}
            </p>
            <label className="grid gap-1.5 text-sm font-medium text-gray-800">
              {t("dashboard.delete.confirmLabel")}
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={`h-10 rounded-md border border-gray-300 px-3 text-sm font-normal ${FOCUS}`}
              />
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleting(false)}
                disabled={busy}
                className={`min-h-[44px] rounded-md px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 ${FOCUS}`}
              >
                {t("dashboard.delete.back")}
              </button>
              {!archived && (
                <button
                  type="button"
                  onClick={toggleArchived}
                  disabled={busy}
                  className={`min-h-[44px] rounded-md border border-gray-300 px-4 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 ${FOCUS}`}
                >
                  {t("dashboard.delete.archiveInstead")}
                </button>
              )}
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busy || reports === null || !confirmsGoal(typed, plan.mainGoal)}
                className={`min-h-[44px] rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
              >
                {t("dashboard.delete.confirm")}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5">
            <form onSubmit={rename} className="grid gap-1.5">
              <label htmlFor="dashboard-rename" className="text-sm font-medium text-gray-800">
                {t("dashboard.manage.renameLabel")}
              </label>
              <div className="flex gap-2">
                <input
                  id="dashboard-rename"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={500}
                  className={`h-10 min-w-0 flex-1 rounded-md border border-gray-300 px-3 text-sm ${FOCUS}`}
                />
                <button
                  type="submit"
                  disabled={busy || !newName || newName === plan.mainGoal}
                  className={`min-h-[40px] flex-none rounded-md bg-gray-900 px-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
                >
                  {t("dashboard.manage.renameSave")}
                </button>
              </div>
            </form>

            <ul className="grid gap-3">
              {!archived && (
                <li>
                  <ActionButton
                    icon={completed ? RotateCcw : CheckCircle2}
                    onClick={toggleCompleted}
                    disabled={busy}
                  >
                    {t(completed ? "dashboard.manage.reopen" : "dashboard.manage.complete")}
                  </ActionButton>
                </li>
              )}
              <li>
                <ActionButton
                  icon={archived ? ArchiveRestore : Archive}
                  onClick={toggleArchived}
                  disabled={busy}
                  hint={archived ? undefined : t("dashboard.manage.archiveHint")}
                >
                  {t(archived ? "dashboard.manage.restore" : "dashboard.manage.archive")}
                </ActionButton>
              </li>
              <li>
                <ActionButton
                  icon={Copy}
                  onClick={duplicate}
                  disabled={busy || plan.subgoalCount === 0}
                  hint={t("dashboard.manage.duplicateHint")}
                >
                  {t("dashboard.manage.duplicate")}
                </ActionButton>
              </li>
              <li>
                <ActionButton icon={Trash2} onClick={startDeleting} disabled={busy} destructive>
                  {t("dashboard.manage.delete")}
                </ActionButton>
              </li>
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ActionButton({
  icon: Icon,
  children,
  hint,
  onClick,
  disabled,
  destructive = false,
}: {
  icon: LucideIcon
  children: ReactNode
  hint?: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  const hintId = useId()
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        className={`flex min-h-[44px] w-full items-center gap-3 rounded-md border px-3 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS} ${
          destructive
            ? "border-red-200 text-red-700 hover:bg-red-50"
            : "border-gray-200 text-gray-800 hover:bg-gray-50"
        }`}
      >
        <Icon className="h-4 w-4 flex-none" aria-hidden="true" />
        {children}
      </button>
      {hint && (
        <p id={hintId} className="mt-1 px-1 text-xs leading-relaxed text-gray-600">
          {hint}
        </p>
      )}
    </>
  )
}
