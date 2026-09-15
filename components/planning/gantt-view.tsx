"use client"

/**
 * The plan as a Gantt chart (FR-3.1–3.8), drawn by DHTMLX Gantt Community.
 *
 * This module, the library and its stylesheet load only when the chart tab
 * opens. The chart draws and reports; what a drag means is decided in
 * lib/gantt-data.ts, and every change goes through the same save, rollback
 * and Undo as the other tabs. The library's own editing dialog, task creation
 * and deletion are switched off, and plan text is escaped before the library
 * writes it into the page.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Gantt } from "dhtmlx-gantt"
import "dhtmlx-gantt/codebase/dhtmlxgantt.css"
import "@/components/planning/gantt-view.css"

import { formatDay } from "@/components/planning/todo-row"
import {
  dragChange,
  dragConsequences,
  escapeHtml,
  ganttRows,
  isAreaRowId,
  progressFromDrag,
  type GanttRow,
  type Shift,
} from "@/lib/gantt-data"
import { useLanguage } from "@/lib/language-context"
import type { PlanSchedule } from "@/lib/plan-schedule"
import { isNoop, undoFor, type ActionChange, type PlannedAction, type ScheduleEntry } from "@/lib/schedule"
import type { Language } from "@/lib/types"

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"

type GanttInstance = ReturnType<typeof Gantt.getGanttInstance>
type Zoom = "day" | "week" | "month"
const ZOOMS: readonly Zoom[] = ["day", "week", "month"]
const COLUMN_WIDTH: Record<Zoom, number> = { day: 30, week: 56, month: 72 }
const ROW_HEIGHT = 36
const SCALE_HEIGHT = 50
const MAX_HEIGHT = 640
/** DHTMLX calls Korean "kr". */
const CHART_LOCALE: Record<Language, string> = { ko: "kr", en: "en", fi: "fi" }

/** A row as the library hands it back: dates parsed, end exclusive. */
type ChartTask = Omit<GanttRow, "start_date"> & { start_date: Date; end_date: Date }

/** `css` marks today (and weekends) on the lower scale, the one whose cells match the timeline's. */
function scalesFor(zoom: Zoom, language: Language, css: (date: Date) => string) {
  const month = language === "ko" ? "%Y년 %F" : "%F %Y"
  const dayOfMonth = language === "fi" ? "%j.%n." : "%n/%j"
  switch (zoom) {
    case "day":
      return [
        { unit: "month", step: 1, format: month },
        { unit: "day", step: 1, format: "%j", css },
      ]
    case "week":
      return [
        { unit: "month", step: 1, format: month },
        { unit: "week", step: 1, format: dayOfMonth, css },
      ]
    case "month":
      return [
        { unit: "year", step: 1, format: language === "ko" ? "%Y년" : "%Y" },
        { unit: "month", step: 1, format: "%M", css },
      ]
  }
}

interface GanttViewProps {
  schedule: PlanSchedule
  entries: Map<string, ScheduleEntry>
  today: string
  names: Map<string, string>
  saving: boolean
  /** Bumped when a save is refused, so a dragged bar goes back to its stored place. */
  resetKey: number
  onApply: (changes: ActionChange[], message: string, undo?: ActionChange[]) => Promise<boolean>
  onAddPrerequisite: (actionId: string, dependsOnId: string) => void
  onRemovePrerequisite: (actionId: string, dependsOnId: string) => void
  onError: (message: string) => void
  onOpenSchedule: () => void
}

export default function GanttView(props: GanttViewProps) {
  const { schedule, entries, names, saving, resetKey, onApply, onRemovePrerequisite, onOpenSchedule } = props
  const { t, language } = useLanguage()
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<GanttInstance | null>(null)
  const zoomRef = useRef<Zoom>("day")
  // What the chart last showed, so a redraw keeps the scroll position unless the chart or scale changed.
  const shown = useRef<{ generation: number; zoom: Zoom } | null>(null)
  const [generation, setGeneration] = useState(0)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState<Zoom>("day")
  const [redraw, setRedraw] = useState(0)
  const [narrow, setNarrow] = useState<boolean | null>(null)
  const [showAnyway, setShowAnyway] = useState(false)
  const [follow, setFollow] = useState<{ shifts: Shift[]; basis: PlannedAction[] } | null>(null)
  const [unlink, setUnlink] = useState<{ actionId: string; dependsOnId: string } | null>(null)

  // The chart's handlers are attached once per chart and read the latest props through this.
  const latest = useRef({ props, t, language })
  latest.current = { props, t, language }

  const { rows, links, unscheduled } = useMemo(
    () => ganttRows(schedule.subgoals, schedule.actions, schedule.dependencies, entries),
    [schedule, entries],
  )
  const byId = useMemo(() => new Map(schedule.actions.map((a) => [a.id, a])), [schedule])
  const hasRows = rows.length > 0
  const showChart = narrow === false || showAnyway
  const height = Math.min(MAX_HEIGHT, Math.max(200, SCALE_HEIGHT + rows.length * ROW_HEIGHT + 18))

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)")
    const update = () => setNarrow(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    const element = container.current
    if (!element || !showChart || !hasRows) return

    let gantt: GanttInstance
    try {
      gantt = Gantt.getGanttInstance()
    } catch {
      setFailed(true)
      return
    }
    const tr = latest.current.t
    const lang = latest.current.language
    const toDay = gantt.date.date_to_str("%Y-%m-%d")
    const day = (date: Date) => formatDay(toDay(date), lang)
    const titleOf = (task: ChartTask) =>
      task.type === "project" ? `${tr("planning.item.area", { n: task.area })} · ${task.text}` : task.text

    gantt.plugins({ keyboard_navigation: true, tooltip: true })
    gantt.i18n.setLocale(CHART_LOCALE[lang])
    Object.assign(gantt.config, {
      date_format: "%Y-%m-%d",
      duration_unit: "day",
      round_dnd_dates: true,
      row_height: ROW_HEIGHT,
      bar_height: 22,
      scale_height: SCALE_HEIGHT,
      details_on_dblclick: false,
      details_on_create: false,
      drag_project: false,
      drag_links: true,
      drag_move: true,
      drag_resize: true,
      drag_progress: true,
      order_branch: false,
      show_errors: false,
      keyboard_navigation_cells: true,
      grid_width: 330,
    })
    gantt.config.columns = [
      {
        name: "text",
        label: escapeHtml(tr("planning.gantt.col.action")),
        tree: true,
        width: 210,
        template: (item: unknown) => escapeHtml(titleOf(item as ChartTask)),
      },
      {
        name: "start_date",
        label: escapeHtml(tr("planning.gantt.col.start")),
        align: "center",
        width: 72,
        template: (item: unknown) => {
          const task = item as ChartTask
          return task.type === "project" ? "" : escapeHtml(day(task.start_date))
        },
      },
      {
        name: "duration",
        label: escapeHtml(tr("planning.gantt.col.days")),
        align: "center",
        width: 48,
        template: (item: unknown) => {
          const task = item as ChartTask
          return task.type === "project" || task.estimate === null ? "" : String(task.estimate)
        },
      },
    ]

    const cellClass = (date: Date) => {
      const unit = zoomRef.current
      const start = toDay(date)
      const next = toDay(gantt.date.add(date, 1, unit))
      const today = latest.current.props.today
      const classes: string[] = []
      if (start <= today && today < next) classes.push("is-today")
      if (unit === "day" && (date.getDay() === 0 || date.getDay() === 6)) classes.push("is-weekend")
      return classes.join(" ")
    }
    // The header gets the same classes through its scale's `css` (the scale template does not reach it).
    gantt.templates.timeline_cell_class = (_item: unknown, date: Date) => cellClass(date)
    gantt.templates.task_class = (_start: Date, _end: Date, item: unknown) => {
      const task = item as ChartTask
      return [`area-${task.area}`, task.locked ? "is-locked" : "", task.done ? "is-done" : ""].join(" ")
    }
    gantt.templates.grid_row_class = (_start: Date, _end: Date, item: unknown) => {
      const task = item as ChartTask
      return task.type === "project" ? `area-row area-${task.area}` : ""
    }
    gantt.templates.task_text = (_start: Date, _end: Date, item: unknown) => {
      const task = item as ChartTask
      return task.type === "project" ? "" : escapeHtml(task.text)
    }
    gantt.templates.progress_text = () => ""
    // Also the bar's accessible name: the library reads it back without the tags.
    gantt.templates.tooltip_text = (start: Date, end: Date, item: unknown) => {
      const task = item as ChartTask
      const lines = [
        titleOf(task),
        tr("planning.gantt.tip.range", { start: day(start), end: day(gantt.date.add(end, -1, "day")) }),
      ]
      if (task.type !== "project") {
        if (task.estimate !== null) lines.push(tr("planning.gantt.tip.days", { days: task.estimate }))
        lines.push(tr("planning.gantt.tip.progress", { progress: Math.round(task.progress * 100) }))
        if (task.locked) lines.push(tr("planning.gantt.tip.locked"))
        if (task.done) lines.push(tr("planning.gantt.tip.done"))
      }
      return lines.map((line, i) => `<div${i === 0 ? " class='gantt-tip-title'" : ""}>${escapeHtml(line)}</div>`).join(" ")
    }
    gantt.templates.drag_link = (from: string | number, _fromStart: boolean, to: string | number) => {
      const source = gantt.isTaskExists(from) ? escapeHtml(String(gantt.getTask(from).text)) : ""
      const target = to && gantt.isTaskExists(to) ? ` → ${escapeHtml(String(gantt.getTask(to).text))}` : ""
      return `${source}${target}`
    }

    // Editing happens through the plan's own saves, never the library's dialogs.
    gantt.attachEvent("onBeforeLightbox", () => false)
    gantt.attachEvent("onTaskDblClick", () => false)
    gantt.attachEvent("onBeforeTaskAdd", () => false)
    gantt.attachEvent("onBeforeTaskDelete", () => false)

    gantt.attachEvent("onBeforeTaskDrag", (id: string | number) => {
      const { props: now } = latest.current
      if (now.saving || isAreaRowId(id)) return false
      const action = now.schedule.actions.find((a) => a.id === String(id))
      return Boolean(action && action.progress !== 100)
    })

    gantt.attachEvent("onAfterTaskDrag", (id: string | number, mode: string) => {
      const { props: now, t: tn, language: ln } = latest.current
      const action = now.schedule.actions.find((a) => a.id === String(id))
      if (!action) return
      const task = gantt.getTask(id) as unknown as ChartTask
      const modes = gantt.config.drag_mode as Record<string, string>

      if (mode === modes.progress) {
        const progress = progressFromDrag(Number(task.progress ?? 0))
        if (progress === action.progress) {
          setRedraw((n) => n + 1)
          return
        }
        void now.onApply(
          [{ id: action.id, progress }],
          tn("planning.gantt.done.progress", { action: action.content, progress }),
          [{ id: action.id, progress: action.progress }],
        )
        return
      }
      if (mode !== modes.move && mode !== modes.resize) return

      const kind = mode === modes.resize ? "resize" : "move"
      const change = dragChange(action, toDay(task.start_date), toDay(task.end_date), now.schedule.scheduleMode, kind)
      if (isNoop(action, change)) {
        setRedraw((n) => n + 1)
        return
      }
      const { shifts, conflicts } = dragConsequences(now.schedule.actions, now.schedule.dependencies, change, {
        mode: now.schedule.scheduleMode,
        today: now.today,
      })
      let message =
        kind === "resize"
          ? tn("planning.gantt.done.resized", { action: action.content, days: change.estimateDays ?? 1 })
          : tn("planning.gantt.done.moved", { action: action.content, date: formatDay(change.startDate!, ln) })
      if (conflicts.length > 0) {
        message += ` · ${tn("planning.gantt.conflict", { names: conflicts.map((c) => now.names.get(c) ?? "—").join(", ") })}`
      }
      void now.onApply([change], message, [undoFor(action, change)]).then((saved) => {
        // The prompt belongs to the plan as this change left it; Undo or any later change retires it.
        if (saved && shifts.length > 0) setFollow({ shifts, basis: latest.current.props.schedule.actions })
      })
    })

    // A new line is saved as a prerequisite and drawn once saved; the library never keeps its own.
    gantt.attachEvent("onBeforeLinkAdd", (_id: string | number, link: { source: string | number; target: string | number; type: string | number }) => {
      const { props: now, t: tn } = latest.current
      const source = String(link.source)
      const target = String(link.target)
      if (isAreaRowId(source) || isAreaRowId(target) || source === target) return false
      if (String(link.type) !== String(gantt.config.links.finish_to_start)) {
        now.onError(tn("planning.gantt.link.direction"))
        return false
      }
      if (!now.saving) now.onAddPrerequisite(target, source)
      return false
    })
    gantt.attachEvent("onLinkDblClick", (id: string | number) => {
      if (gantt.isLinkExists(id)) {
        const link = gantt.getLink(id)
        setUnlink({ actionId: String(link.target), dependsOnId: String(link.source) })
      }
      return false
    })

    try {
      gantt.init(element)
    } catch {
      gantt.destructor()
      setFailed(true)
      return
    }
    chart.current = gantt
    setGeneration((n) => n + 1)

    return () => {
      chart.current = null
      shown.current = null
      gantt.destructor()
    }
  }, [language, showChart, hasRows])

  useEffect(() => {
    const gantt = chart.current
    if (!gantt) return
    const previous = shown.current
    const scroll = gantt.getScrollState()
    zoomRef.current = zoom
    gantt.config.min_column_width = COLUMN_WIDTH[zoom]
    const css = (date: Date) => String(gantt.templates.timeline_cell_class(undefined as never, date) ?? "")
    gantt.config.scales = scalesFor(zoom, latest.current.language, css) as typeof gantt.config.scales
    gantt.clearAll()
    gantt.parse({ data: rows, links } as unknown as Parameters<GanttInstance["parse"]>[0])
    gantt.setSizes()
    if (previous && previous.generation === generation && previous.zoom === zoom) {
      gantt.scrollTo(scroll.x, scroll.y)
    } else {
      gantt.showDate(gantt.date.str_to_date("%Y-%m-%d")(latest.current.props.today))
    }
    shown.current = { generation, zoom }
  }, [generation, rows, links, zoom, redraw, resetKey, height])

  const day = (value: string) => formatDay(value, language)
  const followShown = follow && follow.basis === schedule.actions ? follow : null

  const resolveFollow = (keep: boolean) => {
    if (!followShown) return
    const { shifts } = followShown
    setFollow(null)
    const undo = shifts.map((s) => ({
      id: s.id,
      startDate: byId.get(s.id)?.startDate ?? null,
      dateLocked: byId.get(s.id)?.dateLocked ?? false,
    }))
    void onApply(
      shifts.map((s) => (keep ? { id: s.id, startDate: s.from, dateLocked: true } : { id: s.id, startDate: s.startDate })),
      t(keep ? "planning.gantt.done.kept" : "planning.gantt.done.pushed", { n: shifts.length }),
      undo,
    )
  }

  const legendSwatch = "inline-block h-3 w-5 rounded-sm align-middle"

  return (
    <section className="mt-6" aria-labelledby="gantt-heading">
      <h2 id="gantt-heading" className="sr-only">
        {t("planning.gantt.label")}
      </h2>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl text-sm text-gray-600">
          <p>{t("planning.gantt.hint")}</p>
          <p className="mt-1">
            {t("planning.gantt.keyboard")}{" "}
            <button type="button" onClick={onOpenSchedule} className={`rounded font-medium text-gray-900 underline ${FOCUS}`}>
              {t("planning.gantt.openSchedule")}
            </button>
          </p>
        </div>
        <div
          role="group"
          aria-label={t("planning.gantt.zoom.label")}
          className="flex w-fit shrink-0 gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-gray-200"
        >
          {ZOOMS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={zoom === key}
              onClick={() => setZoom(key)}
              className={`min-h-[40px] rounded-md px-3 text-sm font-medium ${FOCUS} ${
                zoom === key ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {t(`planning.gantt.zoom.${key}`)}
            </button>
          ))}
        </div>
      </div>

      {followShown && (
        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4" role="group" aria-labelledby="gantt-follow">
          <h3 id="gantt-follow" className="font-semibold text-sky-950">
            {t("planning.gantt.follow.title", { n: followShown.shifts.length })}
          </h3>
          <p className="mt-1 text-sm text-sky-950">{t("planning.gantt.follow.body")}</p>
          <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-sm text-sky-950">
            {followShown.shifts.map((s) => (
              <li key={s.id}>
                {t("planning.gantt.follow.change", { action: names.get(s.id) ?? "—", from: day(s.from), to: day(s.startDate) })}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => resolveFollow(false)}
              className={`min-h-[40px] rounded-md bg-sky-800 px-4 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-60 ${FOCUS}`}
            >
              {t("planning.gantt.follow.push")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => resolveFollow(true)}
              className={`min-h-[40px] rounded-md border border-sky-300 bg-white px-4 text-sm font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-60 ${FOCUS}`}
            >
              {t("planning.gantt.follow.keep")}
            </button>
          </div>
        </div>
      )}

      {unlink && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="min-w-0 flex-1">
            {t("planning.gantt.link.remove", {
              from: names.get(unlink.dependsOnId) ?? "—",
              to: names.get(unlink.actionId) ?? "—",
            })}
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              const edge = unlink
              setUnlink(null)
              onRemovePrerequisite(edge.actionId, edge.dependsOnId)
            }}
            className={`min-h-[40px] rounded-md bg-amber-800 px-4 font-semibold text-white hover:bg-amber-900 disabled:opacity-60 ${FOCUS}`}
          >
            {t("planning.gantt.link.confirm")}
          </button>
          <button
            type="button"
            onClick={() => setUnlink(null)}
            className={`min-h-[40px] rounded-md border border-amber-300 bg-white px-4 font-medium text-amber-900 hover:bg-amber-100 ${FOCUS}`}
          >
            {t("planning.gantt.link.cancel")}
          </button>
        </div>
      )}

      {failed ? (
        <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{t("planning.gantt.loadFailed")}</p>
      ) : !hasRows ? (
        <p className="mt-10 text-center text-sm text-gray-600">{t("planning.gantt.empty")}</p>
      ) : narrow === null ? (
        <div className="mt-4 h-40 animate-pulse rounded-lg bg-white/60 motion-reduce:animate-none" aria-busy="true" />
      ) : !showChart ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <p>{t("planning.gantt.narrow")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenSchedule}
              className={`min-h-[40px] rounded-md bg-gray-900 px-4 font-semibold text-white hover:bg-gray-800 ${FOCUS}`}
            >
              {t("planning.gantt.openSchedule")}
            </button>
            <button
              type="button"
              onClick={() => setShowAnyway(true)}
              className={`min-h-[40px] rounded-md border border-gray-300 bg-white px-4 font-medium text-gray-800 hover:bg-gray-50 ${FOCUS}`}
            >
              {t("planning.gantt.showAnyway")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={container}
            className="mandalart-gantt mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white"
            style={{ height }}
            aria-busy={generation === 0}
          />
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
            <li className="flex items-center gap-1.5">
              <span className={legendSwatch} style={{ background: "var(--area-6)", boxShadow: "inset 4px 0 0 var(--area-6-ink)" }} aria-hidden="true" />
              {t("planning.gantt.legend.locked")}
            </li>
            <li className="flex items-center gap-1.5">
              <span className={legendSwatch} style={{ background: "var(--area-6)", opacity: 0.5 }} aria-hidden="true" />
              {t("planning.gantt.legend.done")}
            </li>
            <li className="flex items-center gap-1.5">
              <span className={legendSwatch} style={{ background: "rgba(234, 179, 8, 0.18)", border: "1px solid #e5e7eb" }} aria-hidden="true" />
              {t("planning.gantt.legend.today")}
            </li>
          </ul>
        </>
      )}

      {unscheduled.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-900">
            {t("planning.gantt.unscheduled.title", { n: unscheduled.length })}
          </h3>
          <p className="text-xs text-gray-600">{t("planning.gantt.unscheduled.hint")}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {unscheduled.map((action) => (
              <li
                key={action.id}
                className="max-w-full break-words rounded-full px-2.5 py-1"
                style={{ background: `var(--area-${action.area}-soft)`, color: `var(--area-${action.area}-ink)` }}
              >
                {action.content}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
