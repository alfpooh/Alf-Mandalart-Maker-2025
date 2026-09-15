"use client"

import { useMemo, useState, type FocusEvent, type KeyboardEvent } from "react"
import { CalendarClock } from "lucide-react"

import { formatDay } from "@/components/planning/todo-row"
import { useLanguage } from "@/lib/language-context"
import type { PlanSchedule } from "@/lib/plan-schedule"
import {
  ATTENTION_ISSUES,
  SCHEDULE_MODES,
  fieldChange,
  isNoop,
  scheduleChanges,
  scheduleIssues,
  undoFor,
  type ActionChange,
  type PlannedAction,
  type ScheduleEntry,
  type ScheduleField,
  type ScheduleIssue,
  type ScheduleMode,
} from "@/lib/schedule"

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"

type Filter = "all" | "unscheduled" | "issues"

interface ScheduleTableProps {
  schedule: PlanSchedule
  entries: Map<string, ScheduleEntry>
  today: string
  timeZone: string
  names: Map<string, string>
  saving: boolean
  /** Bumped when a save is refused, so every box shows the stored value again. */
  resetKey: number
  onApply: (changes: ActionChange[], message: string, undo?: ActionChange[]) => Promise<boolean>
  onModeChange: (mode: ScheduleMode) => void
  onError: (message: string) => void
}

/**
 * Every action's dates in one table (FR-2.1–2.6, and the table alternative to
 * the Gantt chart in FR-3.8).
 *
 * Boxes save when they lose focus or on Enter, never while a date is still
 * being typed. A start date typed here is fixed; automatic scheduling moves
 * everything else around it, and shows what it would move before it does.
 */
export function ScheduleTable({
  schedule,
  entries,
  today,
  timeZone,
  names,
  saving,
  resetKey,
  onApply,
  onModeChange,
  onError,
}: ScheduleTableProps) {
  const { t, language } = useLanguage()
  const [filter, setFilter] = useState<Filter>("all")
  const [previewing, setPreviewing] = useState(false)

  const byId = useMemo(() => new Map(schedule.actions.map((a) => [a.id, a])), [schedule])
  const issuesOf = useMemo(
    () => new Map(schedule.actions.map((a) => [a.id, scheduleIssues(a, entries.get(a.id))])),
    [schedule, entries],
  )
  const pending = useMemo(() => scheduleChanges(schedule.actions, entries), [schedule, entries])

  const matches = (action: PlannedAction, which: Filter) => {
    const issues = issuesOf.get(action.id) ?? []
    if (which === "unscheduled") return issues.some((i) => i.kind === "unscheduled")
    if (which === "issues") return issues.some((i) => ATTENTION_ISSUES.includes(i.kind))
    return true
  }
  const counts = {
    all: schedule.actions.length,
    unscheduled: schedule.actions.filter((a) => matches(a, "unscheduled")).length,
    issues: schedule.actions.filter((a) => matches(a, "issues")).length,
  }
  const groups = schedule.subgoals
    .map((subgoal) => ({
      subgoal,
      actions: schedule.actions.filter((a) => a.subgoalId === subgoal.id && matches(a, filter)),
    }))
    .filter((group) => group.actions.length > 0)

  const day = (value: string | null) => (value ? formatDay(value, language) : "—")
  const nameList = (ids: string[]) => ids.map((id) => names.get(id) ?? "—").join(", ")

  const issueText = (issue: ScheduleIssue): string => {
    switch (issue.kind) {
      case "unscheduled":
        return t("planning.schedule.issue.unscheduled")
      case "conflict":
        return t("planning.schedule.issue.conflict", { names: nameList(issue.ids) })
      case "unknownPrerequisite":
        return t("planning.schedule.issue.unknown", { names: nameList(issue.ids) })
      case "endsAfterDue":
        return t("planning.schedule.issue.endsAfterDue", { days: issue.days })
      case "moves":
        return t("planning.schedule.issue.moves", { date: day(issue.start) })
    }
  }

  const commit = (action: PlannedAction, field: ScheduleField, raw: string | boolean) => {
    const result = fieldChange(action, field, raw)
    if (!result.ok) {
      onError(t(result.reason === "estimate" ? "planning.schedule.error.estimate" : "schedule.error.invalid"))
      return
    }
    if (isNoop(action, result.change)) return
    void onApply([result.change], t("planning.schedule.done.saved"), [undoFor(action, result.change)])
  }

  /** Saves a box when focus leaves it — unless the browser holds a date that is only half typed. */
  const onBlur = (action: PlannedAction, field: ScheduleField) => (event: FocusEvent<HTMLInputElement>) => {
    if (event.currentTarget.validity.badInput) {
      onError(t(field === "estimateDays" ? "planning.schedule.error.estimate" : "schedule.error.invalid"))
      return
    }
    commit(action, field, event.currentTarget.value)
  }
  const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur()
  }

  const applyAutomatic = async () => {
    const changes = pending.slice(0, 64)
    const undo = changes.map((change) => ({ id: change.id, startDate: byId.get(change.id)?.startDate ?? null }))
    const saved = await onApply(changes, t("planning.schedule.done.applied", { n: changes.length }), undo)
    if (saved) setPreviewing(false)
  }

  const input = `h-9 w-full min-w-0 rounded-md border border-gray-300 bg-white px-2 text-sm tabular-nums disabled:bg-gray-50 disabled:text-gray-500 ${FOCUS}`

  return (
    <section className="mt-6" aria-labelledby="schedule-heading">
      <h2 id="schedule-heading" className="sr-only">
        {t("planning.tabs.schedule")}
      </h2>

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <p className="text-sm text-gray-600" suppressHydrationWarning>
          {t("planning.schedule.today", { date: day(today), zone: timeZone })}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span className="whitespace-nowrap">{t("planning.schedule.mode")}</span>
            <select
              value={schedule.scheduleMode}
              disabled={saving}
              onChange={(event) => onModeChange(event.target.value as ScheduleMode)}
              className={`h-10 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 text-sm ${FOCUS}`}
            >
              {SCHEDULE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`planning.schedule.${mode}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span className="whitespace-nowrap">{t("planning.schedule.filter.label")}</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as Filter)}
              className={`h-10 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 text-sm ${FOCUS}`}
            >
              {(["all", "unscheduled", "issues"] as const).map((key) => (
                <option key={key} value={key}>
                  {t(`planning.schedule.filter.${key}`)} ({counts[key]})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setPreviewing((open) => !open)}
            aria-expanded={previewing}
            aria-controls="automatic-schedule"
            className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 ${FOCUS}`}
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            {t("planning.schedule.auto.preview")}
          </button>
        </div>
      </div>

      {previewing && (
        <div id="automatic-schedule" className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4">
          <h3 className="font-semibold text-sky-950">
            {pending.length > 0
              ? t("planning.schedule.auto.title", { n: pending.length })
              : t("planning.schedule.auto.none")}
          </h3>
          {pending.length > 0 && (
            <ul className="mt-2 max-h-60 list-disc overflow-y-auto pl-5 text-sm text-sky-950">
              {pending.map((change) => (
                <li key={change.id}>
                  {t("planning.schedule.auto.change", {
                    action: names.get(change.id) ?? "—",
                    from: byId.get(change.id)?.startDate ? day(byId.get(change.id)!.startDate) : t("planning.schedule.auto.noDate"),
                    to: day(change.startDate),
                  })}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {pending.length > 0 && (
              <button
                type="button"
                onClick={() => void applyAutomatic()}
                disabled={saving}
                className={`min-h-[40px] rounded-md bg-sky-800 px-4 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-60 ${FOCUS}`}
              >
                {t("planning.schedule.auto.apply")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPreviewing(false)}
              className={`min-h-[40px] rounded-md border border-sky-300 bg-white px-4 text-sm font-medium text-sky-900 hover:bg-sky-100 ${FOCUS}`}
            >
              {t("planning.schedule.auto.cancel")}
            </button>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="mt-10 text-center text-sm text-gray-600">{t("planning.schedule.empty")}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <caption className="px-3 py-2 text-left text-xs text-gray-600">{t("planning.schedule.caption")}</caption>
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
              <tr>
                <th scope="col" className="px-3 py-2">{t("planning.schedule.col.action")}</th>
                <th scope="col" className="w-40 px-2 py-2">{t("planning.schedule.col.start")}</th>
                <th scope="col" className="w-20 px-2 py-2">{t("planning.schedule.col.estimate")}</th>
                <th scope="col" className="w-20 px-2 py-2">{t("planning.schedule.col.end")}</th>
                <th scope="col" className="w-40 px-2 py-2">{t("planning.schedule.col.due")}</th>
                <th scope="col" className="w-14 px-2 py-2 text-center">{t("planning.schedule.col.lock")}</th>
                <th scope="col" className="px-3 py-2">{t("planning.schedule.col.notes")}</th>
              </tr>
            </thead>
            {groups.map(({ subgoal, actions }) => (
              <tbody key={subgoal.id}>
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={7}
                    className="border-t border-gray-200 px-3 py-2 text-left text-xs font-semibold"
                    style={{ background: `var(--area-${subgoal.position + 1}-soft)`, color: `var(--area-${subgoal.position + 1}-ink)` }}
                  >
                    {t("planning.item.area", { n: subgoal.position + 1 })} · {subgoal.content}
                  </th>
                </tr>
                {actions.map((action) => {
                  const entry = entries.get(action.id)
                  const issues = issuesOf.get(action.id) ?? []
                  const done = action.progress === 100
                  const rowKey = `${action.id}:${resetKey}`
                  return (
                    <tr key={action.id} className="border-t border-gray-100 align-top">
                      <th scope="row" className="px-3 py-2 text-left font-medium text-gray-900">
                        <span className={done ? "text-gray-500 line-through" : ""}>{action.content}</span>
                      </th>
                      <td className="px-2 py-1.5">
                        <input
                          key={`${rowKey}:start:${action.startDate}`}
                          type="date"
                          defaultValue={action.startDate ?? ""}
                          disabled={saving || done}
                          aria-label={t("planning.schedule.label.start", { action: action.content })}
                          onBlur={onBlur(action, "startDate")}
                          onKeyDown={blurOnEnter}
                          className={input}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          key={`${rowKey}:estimate:${action.estimateDays}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={365}
                          step={1}
                          defaultValue={action.estimateDays ?? ""}
                          disabled={saving || done}
                          aria-label={t("planning.schedule.label.estimate", { action: action.content })}
                          onBlur={onBlur(action, "estimateDays")}
                          onKeyDown={blurOnEnter}
                          className={input}
                        />
                      </td>
                      <td className="px-2 py-3 tabular-nums text-gray-700">{entry?.slot ? day(entry.slot.end) : "—"}</td>
                      <td className="px-2 py-1.5">
                        <input
                          key={`${rowKey}:due:${action.dueDate}`}
                          type="date"
                          defaultValue={action.dueDate ?? ""}
                          disabled={saving || done}
                          aria-label={t("planning.schedule.label.due", { action: action.content })}
                          onBlur={onBlur(action, "dueDate")}
                          onKeyDown={blurOnEnter}
                          className={input}
                        />
                      </td>
                      <td className="px-2 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={action.dateLocked}
                          disabled={saving || done}
                          aria-label={t("planning.schedule.label.lock", { action: action.content })}
                          onChange={(event) => commit(action, "dateLocked", event.currentTarget.checked)}
                          className={`h-4 w-4 accent-gray-900 ${FOCUS}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <ul className="flex flex-wrap gap-1 text-xs">
                          {issues.map((issue) => (
                            <li
                              key={issue.kind}
                              className={`rounded-full px-2 py-0.5 ${
                                ATTENTION_ISSUES.includes(issue.kind)
                                  ? "bg-amber-50 text-amber-900"
                                  : issue.kind === "unscheduled"
                                    ? "bg-gray-100 text-gray-700"
                                    : "bg-sky-50 text-sky-900"
                              }`}
                            >
                              {issueText(issue)}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  )
}
