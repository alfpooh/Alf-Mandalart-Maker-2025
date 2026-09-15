"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft } from "lucide-react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"

import { ScheduleTable } from "@/components/planning/schedule-table"
import { TodoRow } from "@/components/planning/todo-row"
import { useLanguage } from "@/lib/language-context"
import {
  addPrerequisite,
  removePrerequisite,
  setScheduleSettings,
  startTracking,
  updatePlanActions,
  type PlanSchedule,
  type ScheduleLoad,
} from "@/lib/plan-schedule"
import {
  TODO_VIEWS,
  applyChanges,
  buildTodo,
  forwardPass,
  inView,
  mergeOrder,
  orderTodo,
  rankChanges,
  todayIn,
  wouldCreateCycle,
  type ActionChange,
  type ScheduleMode,
  type TodoItem,
  type TodoView,
} from "@/lib/schedule"
import { settled } from "@/lib/settle"
import { cacheDraft, loadDraft } from "@/lib/store/local-drafts"
import type { ActionDependency, ProgressValue } from "@/lib/types"

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"

/** How long "Undo" stays offered after marking something done (FR-1.6). */
const UNDO_MS = 12_000
const NOTICE_MS = 6_000

type DueFilter = "any" | "has" | "overdue"
type Notice = { tone: "success" | "error"; text: string; undo?: () => void }

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return "UTC"
  }
}

/**
 * The planning screen, starting with the to-do list (PRD §12.1, 3b).
 *
 * Changes are shown at once and rolled back if the save is refused. Marking
 * something done offers Undo for twelve seconds; reordering and prerequisite
 * changes are one click to reverse as well.
 */
export function PlanningScreen({ planId, initial }: { planId: string; initial: ScheduleLoad }) {
  const { t } = useLanguage()
  const [schedule, setSchedule] = useState<PlanSchedule | null>(initial.status === "loaded" ? initial.schedule : null)
  // "Today" depends on where the viewer is, which the server does not know.
  const [today, setToday] = useState<string | null>(null)
  const [view, setView] = useState<TodoView>("today")
  const [area, setArea] = useState<number | "all">("all")
  const [due, setDue] = useState<DueFilter>("any")
  const [notice, setNotice] = useState<Notice | null>(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<"todo" | "schedule">("todo")
  const [resetKey, setResetKey] = useState(0)
  // The plan as it is now. An Undo button runs later than the render that made
  // it, and reading `schedule` there sees the plan from before the change it
  // is meant to reverse — so a mode undo thought nothing had changed.
  const current = useRef(schedule)
  current.current = schedule
  // Progress each action had before it was ticked in this visit, so un-ticking restores it.
  const beforeDone = useRef(new Map<string, ProgressValue>())

  useEffect(() => {
    const zone = initial.status === "loaded" && initial.schedule.timeZone ? initial.schedule.timeZone : browserZone()
    setToday(todayIn(zone))
    if (initial.status === "loaded") {
      // Records when planning began and the zone days are counted in; fills blanks only.
      void settled(startTracking(planId, browserZone()))
    }
  }, [initial, planId])

  useEffect(() => {
    if (!notice || notice.tone === "error") return
    const timer = setTimeout(() => setNotice(null), notice.undo ? UNDO_MS : NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const names = useMemo(() => new Map((schedule?.actions ?? []).map((a) => [a.id, a.content])), [schedule])

  const items = useMemo(
    () => (schedule && today ? orderTodo(buildTodo(schedule.actions, schedule.dependencies, today)) : []),
    [schedule, today],
  )
  const entries = useMemo(
    () =>
      schedule && today
        ? forwardPass(schedule.actions, schedule.dependencies, { mode: schedule.scheduleMode, today })
        : undefined,
    [schedule, today],
  )

  const counts = useMemo(
    () =>
      Object.fromEntries(
        TODO_VIEWS.map((key) => [key, today ? items.filter((item) => inView(item, key, today, entries)).length : 0]),
      ) as Record<TodoView, number>,
    [items, today, entries],
  )

  const visible = useMemo(
    () =>
      today
        ? items.filter(
            (item) =>
              inView(item, view, today, entries) &&
              (area === "all" || item.action.area === area) &&
              (due === "any" ||
                (due === "has" && item.action.dueDate !== null) ||
                (due === "overdue" && item.action.dueDate !== null && item.action.dueDate < today && item.group !== "done")),
          )
        : [],
    [items, view, area, due, today, entries],
  )
  // A stable list for the sortable context: a new array on every render (a
  // notice appearing or clearing mid-drag) makes it re-register and re-measure
  // the rows, and a keyboard move can then find nothing to move past.
  const visibleIds = useMemo(() => visible.map((item) => item.action.id), [visible])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (initial.status !== "loaded" || !schedule) {
    const reason = initial.status === "unavailable" ? initial.reason : "error"
    return (
      <div className="min-h-[60vh] bg-border px-4 py-16">
        <div className="mx-auto max-w-md rounded-lg bg-white p-6 text-center">
          <h1 className="text-lg font-semibold text-gray-900">
            {reason === "missing" ? t("plan.notFound.title") : t("planning.loadFailed")}
          </h1>
          <Link href="/dashboard" className={`mt-4 inline-block text-sm font-medium underline ${FOCUS}`}>
            {t("header.dashboard")}
          </Link>
        </div>
      </div>
    )
  }

  // ---- saving ---------------------------------------------------------------

  const apply = async (changes: ActionChange[], message: string, undo?: ActionChange[]): Promise<boolean> => {
    if (changes.length === 0) return true
    const before = current.current
    setSchedule((current) => current && { ...current, actions: applyChanges(current.actions, changes, new Date().toISOString()) })
    setSaving(true)
    const result = await settled(updatePlanActions(planId, changes))
    setSaving(false)
    if (!result.ok) {
      setSchedule(before)
      setResetKey((key) => key + 1)
      setNotice({ tone: "error", text: t(result.error) })
      return false
    }
    setNotice({
      tone: "success",
      text: message,
      undo: undo ? () => void apply(undo, t("planning.done.undone")) : undefined,
    })
    return true
  }

  const toggleDone = (item: TodoItem) => {
    const { id, progress } = item.action
    if (progress === 100) {
      const restore = beforeDone.current.get(id) ?? 0
      void apply([{ id, progress: restore }], t("planning.done.reopened"), [{ id, progress: 100 }])
    } else {
      beforeDone.current.set(id, progress)
      void apply([{ id, progress: 100 }], t("planning.done.completed", { action: item.action.content }), [{ id, progress }])
    }
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const ids = visibleIds
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const merged = mergeOrder(
      items.map((item) => item.action.id),
      arrayMove(ids, from, to),
    )
    const changes = rankChanges(merged, schedule.actions)
    const ranks = new Map(schedule.actions.map((a) => [a.id, a.todoRank]))
    void apply(
      changes,
      t("planning.done.reordered"),
      changes.map((change) => ({ id: change.id, todoRank: ranks.get(change.id) ?? null })),
    )
  }

  /** The editor saves its whole edge set, so this browser's copy has to agree. */
  const setDependencies = (next: ActionDependency[]) => {
    setSchedule((current) => current && { ...current, dependencies: next })
    const local = loadDraft(planId)
    if (local) cacheDraft({ ...local, dependencies: next })
  }

  const addEdge = async (actionId: string, dependsOnId: string, silent = false) => {
    const edges = current.current?.dependencies ?? []
    if (wouldCreateCycle(edges, actionId, dependsOnId)) {
      setNotice({ tone: "error", text: t("schedule.error.cycle") })
      return
    }
    setSaving(true)
    const result = await settled(addPrerequisite(planId, actionId, dependsOnId))
    setSaving(false)
    if (!result.ok) {
      setNotice({ tone: "error", text: t(result.error) })
      return
    }
    const edge: ActionDependency = { actionId, dependsOnId, rationale: "", confidence: 1, userEdited: true }
    const latest = current.current?.dependencies ?? []
    setDependencies([...latest.filter((e) => !(e.actionId === actionId && e.dependsOnId === dependsOnId)), edge])
    // `silent` is the undo of a removal: say it was undone, but offer no undo of the undo.
    setNotice(
      silent
        ? { tone: "success", text: t("planning.done.undone") }
        : { tone: "success", text: t("planning.done.prereqAdded"), undo: () => void removeEdge(actionId, dependsOnId, true) },
    )
  }

  const removeEdge = async (actionId: string, dependsOnId: string, silent = false) => {
    setSaving(true)
    const result = await settled(removePrerequisite(planId, actionId, dependsOnId))
    setSaving(false)
    if (!result.ok) {
      setNotice({ tone: "error", text: t(result.error) })
      return
    }
    const latest = current.current?.dependencies ?? []
    setDependencies(latest.filter((e) => !(e.actionId === actionId && e.dependsOnId === dependsOnId)))
    setNotice(
      silent
        ? { tone: "success", text: t("planning.done.undone") }
        : { tone: "success", text: t("planning.done.prereqRemoved"), undo: () => void addEdge(actionId, dependsOnId, true) },
    )
  }

  const candidatesFor = (actionId: string) => () => {
    const existing = new Set(schedule.dependencies.filter((e) => e.actionId === actionId).map((e) => e.dependsOnId))
    return schedule.actions
      .filter((a) => a.id !== actionId && !existing.has(a.id) && !wouldCreateCycle(schedule.dependencies, actionId, a.id))
      .map((a) => ({ id: a.id, label: `${t("planning.item.area", { n: a.area })} · ${a.content}` }))
  }

  const changeMode = async (mode: ScheduleMode, undoing = false) => {
    const previous = current.current?.scheduleMode
    if (!previous || mode === previous) return
    setSchedule((current) => current && { ...current, scheduleMode: mode })
    setSaving(true)
    const result = await settled(setScheduleSettings(planId, { mode }))
    setSaving(false)
    if (!result.ok) {
      setSchedule((current) => current && { ...current, scheduleMode: previous })
      setNotice({ tone: "error", text: t(result.error) })
      return
    }
    setNotice(
      undoing
        ? { tone: "success", text: t("planning.done.undone") }
        : { tone: "success", text: t("planning.schedule.done.mode"), undo: () => void changeMode(previous, true) },
    )
  }

  // ---- keyboard and screen reader announcements -------------------------------

  const position = (id: string | number) => visible.findIndex((item) => item.action.id === String(id)) + 1
  const label = (id: string | number) => names.get(String(id)) ?? ""
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("planning.dnd.start", { action: label(active.id), position: position(active.id) }),
    onDragOver: ({ over }) => (over ? t("planning.dnd.over", { position: position(over.id) }) : undefined),
    onDragEnd: ({ active, over }) =>
      t("planning.dnd.end", { action: label(active.id), position: position(over?.id ?? active.id) }),
    onDragCancel: ({ active }) => t("planning.dnd.cancel", { action: label(active.id) }),
  }

  const summary = {
    now: items.filter((i) => i.group === "now").length,
    waiting: items.filter((i) => i.group === "waiting").length,
    done: items.filter((i) => i.group === "done").length,
  }
  const areas = schedule.subgoals.map((s) => ({ n: s.position + 1, content: s.content }))
  const sortable = view !== "done"

  return (
    <div className="min-h-[70vh] bg-border">
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-10">
        <Link
          href={`/plan/${planId}`}
          className={`inline-flex items-center gap-1 rounded text-sm text-gray-700 hover:underline ${FOCUS}`}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("planning.back")}
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-gray-900 sm:text-3xl">{t("planning.title")}</h1>
        <p className="mt-1 break-words text-gray-700">{schedule.mainGoal}</p>

        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
          {(["now", "waiting", "done"] as const).map((key) => (
            <div key={key} className="flex gap-1.5">
              <dt>{t(`planning.summary.${key}`)}</dt>
              <dd className="font-semibold tabular-nums text-gray-900">{summary[key]}</dd>
            </div>
          ))}
        </dl>

        <div
          role="status"
          aria-live="polite"
          className={
            notice
              ? `mt-4 flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                  notice.tone === "error"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                }`
              : "sr-only"
          }
        >
          <span className="min-w-0 flex-1">{notice?.text}</span>
          {notice?.undo && (
            <button
              type="button"
              onClick={() => {
                const undo = notice.undo
                setNotice(null)
                undo?.()
              }}
              className={`rounded-md border border-emerald-300 bg-white px-3 py-1 font-semibold text-emerald-900 hover:bg-emerald-100 ${FOCUS}`}
            >
              {t("planning.done.undo")}
            </button>
          )}
        </div>

        <div
          role="group"
          aria-label={t("planning.tabs.label")}
          className="mt-6 flex w-fit gap-1 border-b border-gray-300"
        >
          {(["todo", "schedule"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px min-h-[44px] border-b-2 px-4 text-sm font-semibold ${FOCUS} ${
                tab === key ? "border-gray-900 text-gray-900" : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {t(`planning.tabs.${key}`)}
            </button>
          ))}
        </div>

        {tab === "schedule" ? (
          today && entries ? (
            <ScheduleTable
              schedule={schedule}
              entries={entries}
              today={today}
              timeZone={schedule.timeZone ?? browserZone()}
              names={names}
              saving={saving}
              resetKey={resetKey}
              onApply={apply}
              onModeChange={(mode) => void changeMode(mode)}
              onError={(text) => {
                // A refused value must not stay in the box looking saved.
                setResetKey((key) => key + 1)
                setNotice({ tone: "error", text })
              }}
            />
          ) : (
            <div className="mt-6 h-40 animate-pulse rounded-lg bg-white/60 motion-reduce:animate-none" aria-busy="true" />
          )
        ) : (
          <>
        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div
            role="group"
            aria-label={t("planning.views.label")}
            className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-gray-200"
          >
            {TODO_VIEWS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-md px-3 text-sm font-medium ${FOCUS} ${
                  view === key ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {t(`planning.views.${key}`)}
                <span className={`text-xs tabular-nums ${view === key ? "text-gray-300" : "text-gray-500"}`}>
                  {counts[key]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <span className="whitespace-nowrap">{t("planning.filters.area")}</span>
              <select
                value={area}
                onChange={(event) => setArea(event.target.value === "all" ? "all" : Number(event.target.value))}
                className={`h-10 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 text-sm sm:max-w-[14rem] ${FOCUS}`}
              >
                <option value="all">{t("planning.filters.allAreas")}</option>
                {areas.map((a) => (
                  <option key={a.n} value={a.n}>
                    {t("planning.item.area", { n: a.n })} · {a.content}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <span className="whitespace-nowrap">{t("planning.filters.due")}</span>
              <select
                value={due}
                onChange={(event) => setDue(event.target.value as DueFilter)}
                className={`h-10 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 text-sm ${FOCUS}`}
              >
                <option value="any">{t("planning.filters.anyDue")}</option>
                <option value="has">{t("planning.filters.hasDue")}</option>
                <option value="overdue">{t("planning.filters.overdue")}</option>
              </select>
            </label>
          </div>
        </div>

        {!today ? (
          <div className="mt-6 h-40 animate-pulse rounded-lg bg-white/60 motion-reduce:animate-none" aria-busy="true" />
        ) : visible.length === 0 ? (
          <p className="mt-10 text-center text-sm text-gray-600">{t(`planning.empty.${view}`)}</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            accessibility={{ announcements, screenReaderInstructions: { draggable: t("planning.dnd.instructions") } }}
          >
            <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
              <ol aria-label={t(`planning.views.${view}`)} className="mt-4 grid gap-2">
                {visible.map((item) => (
                  <TodoRow
                    key={item.action.id}
                    item={item}
                    names={names}
                    prerequisites={schedule.dependencies.filter((e) => e.actionId === item.action.id).map((e) => e.dependsOnId)}
                    candidates={candidatesFor(item.action.id)}
                    sortable={sortable}
                    disabled={saving}
                    onToggleDone={() => toggleDone(item)}
                    onAddPrerequisite={(dependsOnId) => void addEdge(item.action.id, dependsOnId)}
                    onRemovePrerequisite={(dependsOnId) => void removeEdge(item.action.id, dependsOnId)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
          </>
        )}
      </main>
    </div>
  )
}
