"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Plus, Search } from "lucide-react"

import { describeDay } from "@/components/dashboard/describe-day"
import { ManagePlanDialog, type ManageOutcome } from "@/components/dashboard/manage-plan-dialog"
import { PlanCard } from "@/components/dashboard/plan-card"
import { UnsavedDraftsBanner } from "@/components/dashboard/unsaved-drafts-banner"
import {
  listPlanSummaries,
  setPlanPinned,
  setPlansArchived,
  type DashboardData,
} from "@/lib/dashboard"
import { useLanguage } from "@/lib/language-context"
import {
  DASHBOARD_SORTS,
  DASHBOARD_TABS,
  initialTab,
  overview,
  parsePrefs,
  tabCounts,
  visiblePlans,
  type DashboardPrefs,
  type DashboardSort,
  type DashboardTab,
  type PlanSummary,
} from "@/lib/plan-summary"
import type { QuotaVerdict } from "@/lib/quota"
import { settled } from "@/lib/settle"

const PREFS_KEY = "mandalart.dashboard"
/** Cards added per "show more". */
const PAGE_SIZE = 24
/** How long a confirmation stays. Errors stay until the next action replaces them. */
const NOTICE_MS = 6000

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"

type Notice = { tone: "success" | "error"; text: string }

/**
 * Every Mandalart this account holds: pick one up again, or tidy them.
 *
 * Pinning is shown at once and rolled back if the server refuses. Anything
 * that changes a plan's status re-reads the list instead, because where a
 * restored plan lands (completed or in progress) is the server's decision.
 */
export function DashboardScreen({ initial }: { initial: DashboardData }) {
  const { t, language } = useLanguage()
  const [data, setData] = useState(initial)
  const plans = useMemo(() => (data.status === "ok" ? data.plans : []), [data])

  const [tab, setTab] = useState<DashboardTab>(() => initialTab(plans))
  const [sort, setSort] = useState<DashboardSort>("activity")
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [managingId, setManagingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  // Storage does not exist on the server, so remembered choices arrive after mount.
  useEffect(() => {
    let prefs: DashboardPrefs = {}
    try {
      prefs = parsePrefs(window.localStorage.getItem(PREFS_KEY))
    } catch {
      /* a private window or blocked storage: the defaults stand */
    }
    if (prefs.tab) setTab(prefs.tab)
    if (prefs.sort) setSort(prefs.sort)
  }, [])

  useEffect(() => {
    if (notice?.tone !== "success") return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const remember = (prefs: Required<DashboardPrefs>) => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* remembering is a convenience */
    }
  }

  const counts = useMemo(() => tabCounts(plans), [plans])
  const totals = useMemo(() => overview(plans), [plans])
  const visible = useMemo(
    () => visiblePlans(plans, { tab, sort, query }, language),
    [plans, tab, sort, query, language],
  )
  const shown = visible.slice(0, limit)
  const chosen = visible.filter((plan) => selected.has(plan.id))
  const managing = plans.find((plan) => plan.id === managingId) ?? null

  const chooseTab = (next: DashboardTab) => {
    setTab(next)
    setSelected(new Set())
    setLimit(PAGE_SIZE)
    remember({ tab: next, sort })
  }

  const chooseSort = (next: DashboardSort) => {
    setSort(next)
    remember({ tab, sort: next })
  }

  const toggleSelected = (id: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const reload = async () => {
    let next: DashboardData | undefined
    try {
      next = await listPlanSummaries()
    } catch {
      next = undefined
    }
    // A failed refresh leaves the last list on screen rather than blanking it.
    if (next) setData(next)
    else setNotice({ tone: "error", text: t("dashboard.error.loadFailed") })
  }

  const patch = (id: string, changes: Partial<PlanSummary>) => {
    setData((current) =>
      current.status === "ok"
        ? {
            ...current,
            plans: current.plans.map((plan) => (plan.id === id ? { ...plan, ...changes } : plan)),
          }
        : current,
    )
  }

  const togglePin = async (plan: PlanSummary) => {
    const pinned = !plan.pinned
    patch(plan.id, { pinned })
    const result = await settled(setPlanPinned(plan.id, pinned))
    if (result.ok) {
      setNotice({
        tone: "success",
        text: t(pinned ? "dashboard.done.pinned" : "dashboard.done.unpinned"),
      })
    } else {
      patch(plan.id, { pinned: plan.pinned })
      setNotice({ tone: "error", text: t(result.error) })
    }
  }

  const archiveChosen = async (archived: boolean) => {
    const ids = chosen.map((plan) => plan.id)
    if (ids.length === 0) return
    setBulkBusy(true)
    const result = await settled(setPlansArchived(ids, archived))
    if (result.ok) {
      setSelected(new Set())
      setNotice({
        tone: "success",
        text: t(archived ? "dashboard.done.archived" : "dashboard.done.restored", { n: ids.length }),
      })
      await reload()
    } else {
      setNotice({ tone: "error", text: t(result.error) })
    }
    setBulkBusy(false)
  }

  const onManaged = async (outcome: ManageOutcome) => {
    setManagingId(null)
    setNotice({ tone: "success", text: outcome.message })
    if (outcome.kind === "deleted") {
      setData((current) =>
        current.status === "ok"
          ? { ...current, plans: current.plans.filter((plan) => plan.id !== outcome.id) }
          : current,
      )
      toggleSelected(outcome.id, false)
    } else {
      if (outcome.patch) patch(outcome.patch.id, outcome.patch.changes)
      await reload()
    }
  }

  return (
    <div className="min-h-[70vh] bg-border">
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t("dashboard.title")}</h1>
            {plans.length > 0 && (
              <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
                <div className="flex gap-1.5">
                  <dt>{t("dashboard.summary.inProgress")}</dt>
                  <dd className="font-semibold tabular-nums text-gray-900">{totals.inProgress}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>{t("dashboard.summary.completed")}</dt>
                  <dd className="font-semibold tabular-nums text-gray-900">{totals.completed}</dd>
                </div>
                {totals.lastActivityAt && (
                  <div className="flex gap-1.5">
                    <dt>{t("dashboard.summary.lastActivity")}</dt>
                    <dd className="font-semibold text-gray-900" suppressHydrationWarning>
                      {describeDay(totals.lastActivityAt, language)}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </div>
          <NewPlan quota={data.status === "ok" ? data.quota : null} />
        </header>

        <p
          role="status"
          aria-live="polite"
          className={
            notice
              ? `mt-4 rounded-md border px-3 py-2 text-sm ${
                  notice.tone === "error"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                }`
              : "sr-only"
          }
        >
          {notice?.text}
        </p>

        {data.status === "unavailable" ? (
          <p role="alert" className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {t("dashboard.error.loadFailed")}
          </p>
        ) : (
          <>
            <UnsavedDraftsBanner plans={plans} onSaved={reload} />

            {plans.length === 0 ? (
              <div className="mt-8 rounded-lg border border-dashed border-gray-400 bg-white px-6 py-12 text-center">
                <h2 className="text-lg font-semibold text-gray-900">{t("dashboard.empty.title")}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-600">
                  {t("dashboard.empty.body")}
                </p>
                <Link
                  href="/"
                  className={`mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-gray-900 px-5 text-sm font-semibold text-white hover:bg-gray-800 ${FOCUS}`}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("dashboard.empty.start")}
                </Link>
              </div>
            ) : (
              <>
                <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div
                    role="group"
                    aria-label={t("dashboard.tabs.label")}
                    className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-gray-200"
                  >
                    {DASHBOARD_TABS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={tab === key}
                        onClick={() => chooseTab(key)}
                        className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-md px-3 text-sm font-medium ${FOCUS} ${
                          tab === key ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {t(`dashboard.tabs.${key}`)}
                        <span
                          className={`text-xs tabular-nums ${tab === key ? "text-gray-300" : "text-gray-500"}`}
                        >
                          {counts[key]}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="relative block sm:w-64">
                      <span className="sr-only">{t("dashboard.search.label")}</span>
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value)
                          setLimit(PAGE_SIZE)
                        }}
                        placeholder={t("dashboard.search.placeholder")}
                        className={`h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm ${FOCUS}`}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="whitespace-nowrap">{t("dashboard.sort.label")}</span>
                      <select
                        value={sort}
                        onChange={(event) => chooseSort(event.target.value as DashboardSort)}
                        className={`h-10 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 text-sm sm:flex-none ${FOCUS}`}
                      >
                        {DASHBOARD_SORTS.map((key) => (
                          <option key={key} value={key}>
                            {t(`dashboard.sort.${key}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                {chosen.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
                    <span className="font-medium tabular-nums">
                      {t("dashboard.bulk.selected", { n: chosen.length })}
                    </span>
                    <div className="ml-auto flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => archiveChosen(tab !== "archived")}
                        disabled={bulkBusy}
                        className="min-h-[36px] rounded-md bg-white px-3 font-semibold text-gray-900 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
                      >
                        {t(tab === "archived" ? "dashboard.bulk.restore" : "dashboard.bulk.archive")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelected(new Set())}
                        disabled={bulkBusy}
                        className="min-h-[36px] rounded-md px-3 font-medium text-gray-200 hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
                      >
                        {t("dashboard.bulk.clear")}
                      </button>
                    </div>
                  </div>
                )}

                {visible.length === 0 ? (
                  <p className="mt-10 text-center text-sm text-gray-600">{t("dashboard.emptyFilter")}</p>
                ) : (
                  <ul
                    aria-label={t("dashboard.listLabel")}
                    className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {shown.map((plan) => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        selected={selected.has(plan.id)}
                        onSelect={(on) => toggleSelected(plan.id, on)}
                        onTogglePin={() => togglePin(plan)}
                        onManage={() => setManagingId(plan.id)}
                      />
                    ))}
                  </ul>
                )}

                {visible.length > shown.length && (
                  <div className="mt-6 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setLimit((current) => current + PAGE_SIZE)}
                      className={`min-h-[44px] rounded-md border border-gray-300 bg-white px-5 text-sm font-medium text-gray-800 hover:bg-gray-50 ${FOCUS}`}
                    >
                      {t("dashboard.more", { shown: shown.length, total: visible.length })}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      <ManagePlanDialog plan={managing} onClose={() => setManagingId(null)} onDone={onManaged} />
    </div>
  )
}

/** The way to start another plan, and how many more today allows. */
function NewPlan({ quota }: { quota: QuotaVerdict | null }) {
  const { t } = useLanguage()
  const exhausted = quota !== null && !quota.allowed
  const className = `inline-flex min-h-[44px] items-center gap-2 rounded-md px-4 text-sm font-semibold ${FOCUS}`

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      {exhausted ? (
        <button
          type="button"
          disabled
          aria-describedby="dashboard-quota"
          className={`${className} cursor-not-allowed bg-gray-300 text-gray-600`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("dashboard.newPlan")}
        </button>
      ) : (
        <Link href="/" className={`${className} bg-gray-900 text-white hover:bg-gray-800`}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("dashboard.newPlan")}
        </Link>
      )}
      {quota && (
        <p id="dashboard-quota" className={`text-xs ${exhausted ? "text-red-800" : "text-gray-600"}`}>
          {exhausted
            ? t(quota.reason ?? "quota.userExhausted")
            : t("dashboard.quotaLeft", { left: Math.max(0, quota.limit - quota.used) })}
        </p>
      )}
    </div>
  )
}
