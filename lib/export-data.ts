/**
 * Text exports: an image to share, a document to read, a table to import.
 *
 * These replace a 114-line hardcoded template that shipped the app's own
 * development notes — "Tech stack: Next.js, React, TypeScript…", a list of
 * build phases, a colour key — inside the file a user downloaded of their own
 * plan. It was also Korean regardless of the chosen language.
 */

import html2canvas from "html2canvas"

import { computeReadiness } from "./graph"
import { draftToActions, type EditorDraft } from "./types"

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function stamp(): string {
  const now = new Date()
  return [
    String(now.getDate()).padStart(2, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    now.getFullYear(),
  ].join(".")
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

/**
 * The grid as a high-resolution PNG.
 *
 * Rendered at three times the on-screen size so it stays sharp pasted into a
 * document or a message, where it will be scaled to whatever width fits.
 */
export async function exportGridPng(
  gridElement: HTMLElement | null,
  goal: string,
): Promise<void> {
  if (!gridElement) throw new Error("no grid to capture")

  const canvas = await html2canvas(gridElement, {
    scale: 3,
    backgroundColor: "#ffffff",
    useCORS: true,
  })

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  )
  if (!blob) throw new Error("canvas produced no image")

  download(blob, `${safeName(goal)}_${stamp()}.png`)
}

/** A filename from the goal: readable, and safe on every filesystem. */
function safeName(goal: string): string {
  const cleaned = goal
    .slice(0, 40)
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .replace(/\s+/g, "_")
  return cleaned.length > 0 ? cleaned : "Mandalart"
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

export type DocLabels = {
  mainGoal: string
  metric: string
  readyTitle: string
  waitingOn: string
}

/** The plan as Markdown, for a notes app or a repository. */
export function toMarkdown(draft: EditorDraft, labels: DocLabels): string {
  const { ready } = computeReadiness(draftToActions(draft), draft.dependencies)
  const readyIds = new Set(ready.map((entry) => entry.action.id))

  const lines: string[] = [
    `# ${draft.mainGoal}`,
    "",
    `_${new Date().toLocaleDateString()}_`,
    "",
  ]

  if (ready.length > 0) {
    lines.push(`## ${labels.readyTitle.replace("{n}", String(ready.length))}`, "")
    for (const entry of ready.slice(0, 10)) lines.push(`- [ ] ${entry.action.content}`)
    lines.push("")
  }

  draft.subgoals.forEach((subgoal, index) => {
    lines.push(`## ${index + 1}. ${subgoal.content}`, "")
    for (const action of draft.actions[subgoal.id] ?? []) {
      // Checkboxes so the file is usable as-is, and a marker for the ones
      // nothing is blocking.
      const mark = readyIds.has(action.id) ? " ⚡" : ""
      lines.push(`- [ ] ${action.content}${mark}`)
      if (action.metric) lines.push(`  - ${labels.metric}: ${action.metric}`)
    }
    lines.push("")
  })

  return lines.join("\n")
}

export function exportMarkdown(draft: EditorDraft, labels: DocLabels): void {
  const blob = new Blob([toMarkdown(draft, labels)], {
    type: "text/markdown;charset=utf-8",
  })
  download(blob, `${safeName(draft.mainGoal)}_${stamp()}.md`)
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Escapes one field. Quotes are doubled; anything risky is quoted. */
function cell(value: string | number): string {
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export type CsvHeaders = {
  areaNo: string
  area: string
  no: string
  action: string
  metric: string
  progress: string
  ready: string
  waitingOn: string
  yes: string
  no_: string
}

/**
 * One row per action, for a task manager or a spreadsheet.
 *
 * Carries the dependency result too — a plan pasted into a task tool without
 * it is 64 undifferentiated rows, which is the pile this app exists to sort.
 */
export function toCsv(draft: EditorDraft, headers: CsvHeaders): string {
  const actions = draftToActions(draft)
  const { ready } = computeReadiness(actions, draft.dependencies)
  const readyIds = new Set(ready.map((entry) => entry.action.id))
  const byId = new Map(actions.map((action) => [action.id, action]))

  const rows: string[] = [
    [
      headers.areaNo,
      headers.area,
      headers.no,
      headers.action,
      headers.metric,
      headers.progress,
      headers.ready,
      headers.waitingOn,
    ]
      .map(cell)
      .join(","),
  ]

  draft.subgoals.forEach((subgoal, areaIndex) => {
    ;(draft.actions[subgoal.id] ?? []).forEach((action, actionIndex) => {
      const blockers = draft.dependencies
        .filter((edge) => edge.actionId === action.id)
        .map((edge) => byId.get(edge.dependsOnId)?.content)
        .filter((content): content is string => Boolean(content))

      rows.push(
        [
          areaIndex + 1,
          subgoal.content,
          actionIndex + 1,
          action.content,
          action.metric ?? "",
          0,
          readyIds.has(action.id) ? headers.yes : headers.no_,
          blockers.join(" · "),
        ]
          .map(cell)
          .join(","),
      )
    })
  })

  return rows.join("\r\n")
}

export function exportCsv(draft: EditorDraft, headers: CsvHeaders): void {
  // The BOM is what makes Excel read this as UTF-8; without it Korean opens
  // as mojibake on Windows, which is where most spreadsheets get opened.
  const blob = new Blob(["\uFEFF", toCsv(draft, headers)], {
    type: "text/csv;charset=utf-8",
  })
  download(blob, `${safeName(draft.mainGoal)}_${stamp()}.csv`)
}
