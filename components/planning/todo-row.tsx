"use client"

import { useId, useState } from "react"
import { GripVertical, X } from "lucide-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { useLanguage } from "@/lib/language-context"
import type { TodoItem, TodoReason } from "@/lib/schedule"

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"

const REASON_STYLE: Record<TodoReason["kind"], string> = {
  unlocks: "bg-sky-50 text-sky-900",
  overdue: "bg-red-50 text-red-800",
  dueSoon: "bg-amber-50 text-amber-900",
  behindArea: "bg-violet-50 text-violet-900",
}

/** A calendar day as "Sep 20" / "9월 20일", never shifted by the viewer's time zone. */
export function formatDay(day: string, language: string): string {
  const [y, m, d] = day.split("-").map(Number)
  return new Intl.DateTimeFormat(language, { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

interface TodoRowProps {
  item: TodoItem
  /** Action id → its text, for naming prerequisites. */
  names: Map<string, string>
  /** Every prerequisite of this action, finished or not. */
  prerequisites: string[]
  /** Actions that could become a prerequisite without closing a loop. Computed when asked. */
  candidates: () => { id: string; label: string }[]
  sortable: boolean
  disabled: boolean
  onToggleDone: () => void
  onAddPrerequisite: (dependsOnId: string) => void
  onRemovePrerequisite: (dependsOnId: string) => void
}

/**
 * One action on the to-do list.
 *
 * The drag handle is its own button, so the checkbox and the prerequisite
 * controls keep working by keyboard while the row can also be reordered by
 * keyboard (Space, arrows, Space).
 */
export function TodoRow({
  item,
  names,
  prerequisites,
  candidates,
  sortable,
  disabled,
  onToggleDone,
  onAddPrerequisite,
  onRemovePrerequisite,
}: TodoRowProps) {
  const { t, language } = useLanguage()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.action.id,
    disabled: !sortable,
  })
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState("")
  const selectId = useId()

  const done = item.group === "done"
  const name = item.action.content
  const options = open && !done ? candidates() : []

  const reasonText = (reason: TodoReason): string => {
    switch (reason.kind) {
      case "unlocks":
        return t("planning.reason.unlocks", { count: reason.count })
      case "overdue":
        return t("planning.reason.overdue", { days: reason.days })
      case "dueSoon":
        return reason.days === 0 ? t("planning.reason.dueToday") : t("planning.reason.dueSoon", { days: reason.days })
      case "behindArea":
        return t("planning.reason.behindArea")
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border bg-white p-3 ${
        isDragging ? "relative z-10 border-gray-900 shadow-lg ring-2 ring-gray-900" : "border-gray-200"
      }`}
    >
      <div className="flex items-start gap-2">
        {sortable && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={t("planning.item.drag", { action: name })}
            className={`flex h-8 w-6 flex-none cursor-grab items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 ${FOCUS}`}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <input
          type="checkbox"
          checked={done}
          disabled={disabled}
          onChange={onToggleDone}
          aria-label={t(done ? "planning.item.markOpen" : "planning.item.complete", { action: name })}
          className={`mt-2 h-4 w-4 flex-none accent-gray-900 ${FOCUS}`}
        />

        <div className="min-w-0 flex-1">
          <p className={`break-words pt-1 text-sm font-medium ${done ? "text-gray-500 line-through" : "text-gray-900"}`}>
            {name}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 font-medium"
              style={{ background: `var(--area-${item.action.area}-soft)`, color: `var(--area-${item.action.area}-ink)` }}
            >
              {t("planning.item.area", { n: item.action.area })}
            </span>
            {item.action.dueDate && (
              <span className="text-gray-600">
                {t("planning.item.due", { date: formatDay(item.action.dueDate, language) })}
              </span>
            )}
            {item.reasons.map((reason) => (
              <span key={reason.kind} className={`rounded-full px-2 py-0.5 ${REASON_STYLE[reason.kind]}`}>
                {reasonText(reason)}
              </span>
            ))}
          </div>

          {item.blockedBy.length > 0 && (
            <p className="mt-1.5 text-xs text-amber-800">
              {t("planning.item.waitingOn", {
                names: item.blockedBy.map((id) => names.get(id) ?? "—").join(", "),
              })}
            </p>
          )}

          <details className="mt-2 text-xs" onToggle={(event) => setOpen(event.currentTarget.open)}>
            <summary className={`w-fit cursor-pointer rounded text-gray-600 hover:text-gray-900 ${FOCUS}`}>
              {t("planning.prereq.title")} ({prerequisites.length})
            </summary>

            {prerequisites.length === 0 ? (
              <p className="mt-2 text-gray-500">{t("planning.prereq.none")}</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {prerequisites.map((id) => (
                  <li key={id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-300 bg-gray-50 py-0.5 pl-2 pr-0.5">
                    <span className="truncate">{names.get(id) ?? "—"}</span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onRemovePrerequisite(id)}
                      aria-label={t("planning.prereq.remove", { name: names.get(id) ?? "" })}
                      className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-900 disabled:opacity-50 ${FOCUS}`}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!done && options.length > 0 && (
              <form
                className="mt-2 flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!choice) return
                  onAddPrerequisite(choice)
                  setChoice("")
                }}
              >
                <label htmlFor={selectId} className="sr-only">
                  {t("planning.prereq.choose")}
                </label>
                <select
                  id={selectId}
                  value={choice}
                  onChange={(event) => setChoice(event.target.value)}
                  className={`min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm ${FOCUS}`}
                >
                  <option value="">{t("planning.prereq.choose")}</option>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!choice || disabled}
                  className={`min-h-[36px] rounded-md bg-gray-900 px-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
                >
                  {t("planning.prereq.save")}
                </button>
              </form>
            )}
          </details>
        </div>
      </div>
    </li>
  )
}
