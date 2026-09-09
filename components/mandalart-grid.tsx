"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, Grid3x3, Maximize2 } from "lucide-react"

import { useLanguage } from "@/lib/language-context"
import {
  blockForSubgoal,
  buildBlocks,
  centreBlock,
  CENTRE,
  type GridBlock,
  type GridCell,
} from "@/lib/grid-layout"
import type { EditorDraft, ProgressValue } from "@/lib/types"

type View = { kind: "full" } | { kind: "overview" } | { kind: "area"; subgoalIndex: number }

interface MandalartGridProps {
  draft: EditorDraft
  /** Progress per action id, 0–100. Phase 4 supplies this; omit for planning. */
  progress?: Record<string, ProgressValue>
  onCellClick?: (cell: GridCell) => void
}

/**
 * The 9×9 grid.
 *
 * Built as nine 3×3 blocks rather than one 81-cell grid, so block boundaries
 * come from the markup instead of being painted onto a uniform lattice — the
 * old version drew 81 identical squares and the Mandalart structure vanished.
 *
 * Sizing is driven by the container, not fixed pixels. The old cells were a
 * hard 80px with 8px text, which put the grid at 720px wide (overflowing every
 * phone) while being too small to read on any screen. Below the full grid's
 * comfortable width the view falls back to a drill-down: the centre block
 * first, then one area at a time, each of which is legible at any size.
 */
export function MandalartGrid({ draft, progress, onCellClick }: MandalartGridProps) {
  const { t } = useLanguage()
  const blocks = useMemo(() => buildBlocks(draft), [draft])

  const containerRef = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(true)
  const [view, setView] = useState<View>({ kind: "full" })
  const [userChose, setUserChose] = useState(false)

  // 9×9 needs roughly 600px before cell text stops being readable.
  useEffect(() => {
    const node = containerRef.current
    if (!node || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) => {
      setWide(entry.contentRect.width >= 600)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Follow the viewport until the reader expresses a preference of their own.
  useEffect(() => {
    if (userChose) return
    setView(wide ? { kind: "full" } : { kind: "overview" })
  }, [wide, userChose])

  const choose = (next: View) => {
    setUserChose(true)
    setView(next)
  }

  const centre = centreBlock(blocks)
  const area = view.kind === "area" ? blockForSubgoal(blocks, view.subgoalIndex) : undefined

  return (
    <div ref={containerRef} className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-2 no-print">
        {view.kind !== "full" && (
          <button
            type="button"
            onClick={() => choose({ kind: "full" })}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
            {t("grid.viewFull")}
          </button>
        )}
        {view.kind === "full" && (
          <button
            type="button"
            onClick={() => choose({ kind: "overview" })}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Grid3x3 className="h-4 w-4" aria-hidden="true" />
            {t("grid.viewOverview")}
          </button>
        )}
        {view.kind === "area" && (
          <button
            type="button"
            onClick={() => choose({ kind: "overview" })}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {t("grid.backToOverview")}
          </button>
        )}
        {!wide && view.kind === "full" && (
          <span className="text-xs text-muted-foreground">{t("grid.narrowHint")}</span>
        )}
      </div>

      {view.kind === "full" && (
        <div
          className="mx-auto grid aspect-square w-full max-w-3xl grid-cols-3 gap-[3px] rounded-md border-2 border-foreground bg-foreground p-[3px]"
          role="table"
          aria-label={t("grid.label")}
        >
          {blocks.map((block) => (
            <Block
              key={block.position}
              block={block}
              progress={progress}
              draft={draft}
              onCellClick={onCellClick}
              onExpand={
                block.subgoalIndex === null
                  ? undefined
                  : () => choose({ kind: "area", subgoalIndex: block.subgoalIndex! })
              }
            />
          ))}
        </div>
      )}

      {view.kind === "overview" && centre && (
        <div className="mx-auto w-full max-w-lg">
          <SingleBlock
            block={centre}
            draft={draft}
            progress={progress}
            onCellClick={onCellClick}
            onCellExpand={(cell) =>
              cell.subgoalIndex !== null && choose({ kind: "area", subgoalIndex: cell.subgoalIndex })
            }
          />
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {t("grid.tapArea")}
          </p>
        </div>
      )}

      {view.kind === "area" && area && (
        <div className="mx-auto w-full max-w-lg">
          <SingleBlock
            block={area}
            draft={draft}
            progress={progress}
            onCellClick={onCellClick}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

/** One 3×3 block inside the full grid. Text scales with the block's own width. */
function Block({
  block,
  draft,
  progress,
  onCellClick,
  onExpand,
}: {
  block: GridBlock
  draft: EditorDraft
  progress?: Record<string, ProgressValue>
  onCellClick?: (cell: GridCell) => void
  onExpand?: () => void
}) {
  return (
    <div
      className="grid aspect-square grid-cols-3 gap-px bg-border [container-type:inline-size]"
      onDoubleClick={onExpand}
      role="rowgroup"
    >
      {block.cells.map((cell, index) => (
        <Cell
          key={index}
          cell={cell}
          draft={draft}
          progress={progress}
          onClick={onCellClick}
          compact
        />
      ))}
    </div>
  )
}

/** A block on its own, at readable size — the overview and drill-down views. */
function SingleBlock({
  block,
  draft,
  progress,
  onCellClick,
  onCellExpand,
}: {
  block: GridBlock
  draft: EditorDraft
  progress?: Record<string, ProgressValue>
  onCellClick?: (cell: GridCell) => void
  onCellExpand?: (cell: GridCell) => void
}) {
  return (
    <div className="grid aspect-square grid-cols-3 gap-px rounded-md border-2 border-foreground bg-border [container-type:inline-size]">
      {block.cells.map((cell, index) => (
        <Cell
          key={index}
          cell={cell}
          draft={draft}
          progress={progress}
          onClick={
            onCellExpand && cell.kind === "subgoal" && index !== CENTRE
              ? () => onCellExpand(cell)
              : onCellClick
          }
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

function cellStyle(cell: GridCell): React.CSSProperties {
  if (cell.kind === "mainGoal") {
    return { background: "var(--area-center)", color: "var(--area-center-fg)" }
  }
  if (cell.area === null) return {}
  if (cell.kind === "subgoal") {
    return { background: `var(--area-${cell.area})`, color: "#FFFFFF" }
  }
  return {
    background: `var(--area-${cell.area}-soft)`,
    color: `var(--area-${cell.area}-ink)`,
  }
}

function Cell({
  cell,
  draft,
  progress,
  onClick,
  compact = false,
}: {
  cell: GridCell
  draft: EditorDraft
  progress?: Record<string, ProgressValue>
  onClick?: ((cell: GridCell) => void) | (() => void)
  compact?: boolean
}) {
  const { t } = useLanguage()

  if (cell.kind === "empty") {
    return <div className="bg-muted" aria-hidden="true" />
  }

  const actionId =
    cell.subgoalId && cell.actionIndex !== null
      ? draft.actions[cell.subgoalId]?.[cell.actionIndex]?.id
      : undefined
  const pct = actionId ? progress?.[actionId] : undefined

  const label =
    cell.kind === "mainGoal"
      ? t("visualization.mainGoal")
      : cell.kind === "subgoal"
        ? `${t("subgoalReview.subgoal")} ${cell.area}`
        : `${t("detailedActions.action")} ${(cell.actionIndex ?? 0) + 1}`

  return (
    <button
      type="button"
      onClick={() => onClick?.(cell as never)}
      style={cellStyle(cell)}
      title={cell.metric ? `${cell.content}\n${cell.metric}` : cell.content}
      aria-label={`${label}: ${cell.content}${pct === undefined ? "" : ` — ${pct}%`}`}
      className={`relative flex items-center justify-center overflow-hidden p-1 text-center transition-transform focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
        onClick ? "cursor-pointer hover:brightness-95" : "cursor-default"
      } ${cell.isBlockCentre ? "font-semibold" : ""}`}
    >
      {/* Phase 4 fills this from the bottom as the action advances. */}
      {pct !== undefined && pct > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/15 dark:bg-white/20"
          style={{ height: `${pct}%` }}
        />
      )}

      <span
        className="relative line-clamp-4 break-words leading-tight"
        style={{
          // Scales with the block, never below what a person can actually read.
          fontSize: compact
            ? "max(9.5px, min(4.2cqw, 13px))"
            : "max(12px, min(4.6cqw, 17px))",
        }}
      >
        {cell.content}
      </span>
    </button>
  )
}
