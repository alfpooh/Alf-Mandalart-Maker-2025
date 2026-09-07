/**
 * PowerPoint export.
 *
 * A Mandalart is already shaped like a deck — one goal, eight areas, eight
 * actions each — so the slides follow that rather than inventing a structure.
 * The point of this format over the PDF is that everything except the grid is
 * editable: someone presenting this will want to cut, reorder and re-word.
 *
 * Korean needs no embedded font here. Unlike a PDF, a .pptx stores text as
 * XML and the reader supplies the typeface, so a font is only named where the
 * choice matters and Hangul falls back to whatever the machine has.
 */

import html2canvas from "html2canvas"

import { areaColor, areaInk, areaSoft, AREA_CENTER } from "./area-colors"
import { computeReadiness } from "./graph"
import { draftToActions, type EditorDraft } from "./types"

export type PptxLabels = {
  deckTitle: string
  overview: string
  area: string
  metric: string
  readyTitle: string
  readyHint: string
  noDeps: string
}

/** 16:9, the shape every projector and screen expects. */
const W = 10
const H = 5.625

export async function exportPlanPptx(
  draft: EditorDraft,
  gridElement: HTMLElement | null,
  labels: PptxLabels,
): Promise<void> {
  // Loaded on demand: the library is large and most people never export.
  const PptxGenJS = (await import("pptxgenjs")).default
  const pptx = new PptxGenJS()

  pptx.layout = "LAYOUT_16x9"
  pptx.title = draft.mainGoal
  pptx.subject = labels.deckTitle

  // --- title --------------------------------------------------------------

  const title = pptx.addSlide()
  title.background = { color: AREA_CENTER }
  title.addText(labels.deckTitle, {
    x: 0.8,
    y: 1.5,
    w: W - 1.6,
    h: 0.4,
    fontSize: 14,
    color: "9AA3B1",
    charSpacing: 2,
  })
  title.addText(draft.mainGoal, {
    x: 0.8,
    y: 2.0,
    w: W - 1.6,
    h: 1.6,
    fontSize: 32,
    bold: true,
    color: "FFFFFF",
    valign: "top",
    // Long goals shrink rather than spill off the slide.
    shrinkText: true,
  })
  title.addText(new Date().toLocaleDateString(), {
    x: 0.8,
    y: 4.3,
    w: W - 1.6,
    h: 0.3,
    fontSize: 11,
    color: "6E7887",
  })

  // --- the grid -----------------------------------------------------------

  if (gridElement) {
    const canvas = await html2canvas(gridElement, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    })
    const slide = pptx.addSlide()
    slide.addText(labels.overview, {
      x: 0.5,
      y: 0.25,
      w: W - 1,
      h: 0.4,
      fontSize: 16,
      bold: true,
      color: "14171C",
    })
    // Square, so height is the binding dimension on a 16:9 slide.
    const size = H - 1.1
    slide.addImage({
      data: canvas.toDataURL("image/png"),
      x: (W - size) / 2,
      y: 0.8,
      w: size,
      h: size,
    })
  }

  // --- one slide per area -------------------------------------------------

  draft.subgoals.forEach((subgoal, index) => {
    const area = index + 1
    const actions = draft.actions[subgoal.id] ?? []
    const slide = pptx.addSlide()

    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: W,
      h: 1.0,
      fill: { color: areaColor(area) },
    })
    slide.addText(`${area}`, {
      x: 0.4,
      y: 0.2,
      w: 0.5,
      h: 0.6,
      fontSize: 24,
      bold: true,
      color: "FFFFFF",
      align: "center",
    })
    slide.addText(subgoal.content, {
      x: 1.0,
      y: 0.2,
      w: W - 1.5,
      h: 0.6,
      fontSize: 20,
      bold: true,
      color: "FFFFFF",
      valign: "middle",
      shrinkText: true,
    })

    // Two columns of four: eight stacked lines at a readable size do not fit.
    actions.forEach((action, actionIndex) => {
      const column = actionIndex < 4 ? 0 : 1
      const row = actionIndex % 4
      const x = 0.4 + column * (W / 2 - 0.2)
      const y = 1.25 + row * 1.02
      const w = W / 2 - 0.6

      slide.addShape(pptx.ShapeType.roundRect, {
        x,
        y,
        w,
        h: 0.92,
        fill: { color: areaSoft(area) },
        line: { color: areaSoft(area) },
        rectRadius: 0.05,
      })
      slide.addText(
        [
          {
            text: `${actionIndex + 1}. ${action.content}`,
            options: { fontSize: 11, color: areaInk(area), breakLine: true },
          },
          ...(action.metric
            ? [
                {
                  text: `${labels.metric}: ${action.metric}`,
                  options: { fontSize: 8.5, color: areaInk(area), italic: true },
                },
              ]
            : []),
        ],
        {
          x: x + 0.12,
          y: y + 0.06,
          w: w - 0.24,
          h: 0.8,
          valign: "top",
          shrinkText: true,
        },
      )
    })
  })

  // --- what can be started now --------------------------------------------

  const { ready } = computeReadiness(draftToActions(draft), draft.dependencies)
  const closing = pptx.addSlide()
  closing.addText(labels.readyTitle.replace("{n}", String(ready.length)), {
    x: 0.6,
    y: 0.4,
    w: W - 1.2,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: "14171C",
  })
  closing.addText(ready.length > 0 ? labels.readyHint : labels.noDeps, {
    x: 0.6,
    y: 0.95,
    w: W - 1.2,
    h: 0.35,
    fontSize: 11,
    color: "565E6B",
  })

  // Six is what fits at a size a room can read; the rest are on the area slides.
  ready.slice(0, 6).forEach((entry, position) => {
    const y = 1.5 + position * 0.62
    closing.addShape(pptx.ShapeType.rect, {
      x: 0.6,
      y,
      w: 0.08,
      h: 0.5,
      fill: { color: AREA_CENTER },
    })
    closing.addText(entry.action.content, {
      x: 0.85,
      y,
      w: W - 1.5,
      h: 0.5,
      fontSize: 13,
      color: "14171C",
      valign: "middle",
      shrinkText: true,
    })
  })

  const now = new Date()
  const stamp = [
    String(now.getDate()).padStart(2, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    now.getFullYear(),
  ].join(".")
  await pptx.writeFile({ fileName: `Mandalart_${stamp}.pptx` })
}
