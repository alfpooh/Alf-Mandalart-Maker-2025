/**
 * PDF export.
 *
 * jsPDF's built-in fonts are Latin-only, so every Hangul character in an
 * exported plan came out blank — the grid image on page one looked fine and
 * the detail pages after it were empty. A subset of Noto Sans KR is registered
 * before anything is written, which makes the text real text: selectable,
 * searchable, and a fraction of the size of a page rendered as an image.
 *
 * The font is 2 MB and fetched only when someone exports, never with the app.
 */

import jsPDF from "jspdf"
import html2canvas from "html2canvas"

import { draftActions, type EditorDraft } from "./types"

const FONT_URL = "/fonts/NotoSansKR-subset.ttf"
const FONT_NAME = "NotoSansKR"
const FONT_FILE = "NotoSansKR-subset.ttf"

/** Cached across exports: the second PDF should not re-download 2 MB. */
let fontData: string | null = null

/**
 * The font as base64.
 *
 * Converted in chunks — `String.fromCharCode(...bytes)` on a two-million-entry
 * array overflows the call stack.
 */
async function loadFont(): Promise<string> {
  if (fontData) return fontData

  const response = await fetch(FONT_URL)
  if (!response.ok) throw new Error(`font ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())

  let binary = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }

  fontData = btoa(binary)
  return fontData
}

export type PdfLabels = {
  title: string
  generated: string
  mainGoal: string
  area: string
  actions: string
  metric: string
}

/**
 * Writes the plan to a PDF and hands it to the browser.
 *
 * `gridElement` is captured as an image because the 9×9 grid is a picture;
 * everything after it is written as text.
 */
export async function exportPlanPdf(
  draft: EditorDraft,
  gridElement: HTMLElement | null,
  labels: PdfLabels,
): Promise<void> {
  const base64 = await loadFont()

  const pdf = new jsPDF("p", "mm", "a4")
  pdf.addFileToVFS(FONT_FILE, base64)
  pdf.addFont(FONT_FILE, FONT_NAME, "normal")
  pdf.setFont(FONT_NAME, "normal")

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15
  const usable = pageWidth - margin * 2

  let y = margin + 8

  pdf.setFontSize(18)
  pdf.text(labels.title, pageWidth / 2, y, { align: "center" })
  y += 8

  pdf.setFontSize(10)
  pdf.setTextColor(110)
  pdf.text(`${labels.generated} ${new Date().toLocaleDateString()}`, pageWidth / 2, y, {
    align: "center",
  })
  pdf.setTextColor(0)
  y += 10

  pdf.setFontSize(13)
  const goalLines = pdf.splitTextToSize(draft.mainGoal, usable)
  pdf.text(goalLines, pageWidth / 2, y, { align: "center" })
  y += goalLines.length * 6 + 6

  if (gridElement) {
    const canvas = await html2canvas(gridElement, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    })
    // The grid is square, so fit it to whichever dimension runs out first.
    const available = pageHeight - margin - y
    const width = Math.min(usable, available * (canvas.width / canvas.height))
    const height = (canvas.height * width) / canvas.width
    pdf.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      (pageWidth - width) / 2,
      y,
      width,
      height,
    )
  }

  // --- detail pages -------------------------------------------------------

  pdf.addPage()
  y = margin

  const ensureRoom = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      pdf.addPage()
      y = margin
    }
  }

  pdf.setFontSize(14)
  pdf.text(labels.mainGoal, margin, y)
  y += 7
  pdf.setFontSize(12)
  const goalDetail = pdf.splitTextToSize(draft.mainGoal, usable)
  pdf.text(goalDetail, margin, y)
  y += goalDetail.length * 6 + 8

  draft.subgoals.forEach((subgoal, index) => {
    const actions = draft.actions[subgoal.id] ?? []
    ensureRoom(18)

    pdf.setFontSize(12.5)
    const heading = pdf.splitTextToSize(`${index + 1}. ${subgoal.content}`, usable)
    pdf.text(heading, margin, y)
    y += heading.length * 6 + 2

    pdf.setDrawColor(200)
    pdf.line(margin, y, pageWidth - margin, y)
    y += 5

    pdf.setFontSize(10.5)
    actions.forEach((action, actionIndex) => {
      const body = pdf.splitTextToSize(`${actionIndex + 1}. ${action.content}`, usable - 6)
      const metric = action.metric
        ? pdf.splitTextToSize(`${labels.metric}: ${action.metric}`, usable - 12)
        : []

      ensureRoom(body.length * 5 + metric.length * 4.5 + 2)

      pdf.setTextColor(0)
      pdf.text(body, margin + 4, y)
      y += body.length * 5

      if (metric.length > 0) {
        pdf.setTextColor(120)
        pdf.setFontSize(9)
        pdf.text(metric, margin + 8, y)
        pdf.setFontSize(10.5)
        pdf.setTextColor(0)
        y += metric.length * 4.5
      }
      y += 1.5
    })

    y += 6
  })

  // Page numbers, once the total is known.
  const pages = pdf.getNumberOfPages()
  pdf.setFontSize(9)
  pdf.setTextColor(140)
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page)
    pdf.text(`${page} / ${pages}`, pageWidth / 2, pageHeight - 8, { align: "center" })
  }

  const now = new Date()
  const stamp = [
    String(now.getDate()).padStart(2, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    now.getFullYear(),
  ].join(".")
  pdf.save(`Mandalart_${stamp}.pdf`)
}

/** Actions across the whole plan, for callers that want a count. */
export { draftActions }
