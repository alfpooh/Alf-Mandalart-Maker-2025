"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, Grid3x3, Maximize2 } from "lucide-react"

import { useLanguage } from "@/lib/language-context"
import {
  blockForSubgoal,
  buildBlocks,
  centreBlock,
  GRID_SIZE,
  gridRows,
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
 * Laid out as nine rows of nine, which is both what it is and what a screen
 * reader needs. It used to be built as nine nested 3×3 blocks: visually right,
 * but the accessibility tree then held nine anonymous groups of nine buttons
 * with no rows and no cells, so nothing could say "row 4, column 7" or move by
 * arrow key. The block structure is now drawn — a wider gutter on the third and
 * sixth boundary — rather than nested, so the Mandalart still reads as nine
 * blocks while the markup stays a real grid.
 *
 * Sizing is driven by the container, not fixed pixels. Below the full grid's
 * comfortable width the view falls back to a drill-down: the centre block
 * first, then one area at a time, each of which is legible at any size.
 */
export function MandalartGrid({ draft, progress, onCellClick }: MandalartGridProps) {
  const { t } = useLanguage()
  const blocks = useMemo(() => buildBlocks(draft), [draft])
  const rows = useMemo(() => gridRows(blocks), [blocks])

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
        <Grid
          rows={rows}
          draft={draft}
          progress={progress}
          onCellClick={onCellClick}
          label={t("grid.label")}
          compact
        />
      )}

      {view.kind === "overview" && centre && (
        <div className="mx-auto w-full max-w-lg">
          <Grid
            rows={blockRows(centre)}
            draft={draft}
            progress={progress}
            label={centre.title}
            onCellClick={(cell) =>
              cell.kind === "subgoal" && cell.subgoalIndex !== null
                ? choose({ kind: "area", subgoalIndex: cell.subgoalIndex })
                : onCellClick?.(cell)
            }
          />
          <p className="mt-3 text-center text-sm text-muted-foreground">{t("grid.tapArea")}</p>
        </div>
      )}

      {view.kind === "area" && area && (
        <div className="mx-auto w-full max-w-lg">
          <Grid
            rows={blockRows(area)}
            draft={draft}
            progress={progress}
            label={area.title}
            onCellClick={onCellClick}
          />
        </div>
      )}
    </div>
  )
}

/** One block as three rows of three, so the small views are grids too. */
function blockRows(block: GridBlock): GridCell[][] {
  return [0, 1, 2].map((row) => block.cells.slice(row * 3, row * 3 + 3))
}

// ---------------------------------------------------------------------------

/**
 * An accessible grid: `grid` > `row` > `gridcell`, with arrow-key movement.
 *
 * Exactly one cell is in the tab order at a time — the standard roving
 * tabindex — so Tab reaches the grid once rather than stepping through
 * eighty-one buttons before whatever follows it.
 */
function Grid({
  rows,
  draft,
  progress,
  onCellClick,
  label,
  compact = false,
}: {
  rows: GridCell[][]
  draft: EditorDraft
  progress?: Record<string, ProgressValue>
  onCellClick?: (cell: GridCell) => void
  label: string
  compact?: boolean
}) {
  const { t } = useLanguage()
  const size = rows.length
  const width = rows[0]?.length ?? 0

  const [active, setActive] = useState<[number, number]>(() => firstFocusable(rows) ?? [0, 0])
  const gridRef = useRef<HTMLDivElement>(null)

  // A plan that loses or gains cells must not leave focus pointing at nothing.
  useEffect(() => {
    setActive((current) => {
      const [row, col] = current
      if (rows[row]?.[col] && rows[row][col].kind !== "empty") return current
      return firstFocusable(rows) ?? [0, 0]
    })
  }, [rows])

  const move = useCallback(
    (from: [number, number], dRow: number, dCol: number): [number, number] => {
      let [row, col] = from
      // Step past empty cells rather than stopping on one, so arrow keys stay
      // useful while a plan is still being filled in.
      for (let step = 0; step < GRID_SIZE * GRID_SIZE; step++) {
        row += dRow
        col += dCol
        if (row < 0 || col < 0 || row >= size || col >= width) return from
        if (rows[row]?.[col]?.kind !== "empty") return [row, col]
      }
      return from
    },
    [rows, size, width],
  )

  const focusCell = useCallback((row: number, col: number) => {
    setActive([row, col])
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-cell="${row}-${col}"] button`)
      ?.focus()
  }, [])

  const onKeyDown = (event: React.KeyboardEvent, row: number, col: number) => {
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const delta = deltas[event.key]
    if (delta) {
      const [nextRow, nextCol] = move([row, col], delta[0], delta[1])
      event.preventDefault()
      focusCell(nextRow, nextCol)
      return
    }
    if (event.key === "Home" || event.key === "End") {
      const target = event.key === "Home" ? 0 : width - 1
      const step = event.key === "Home" ? 1 : -1
      for (let c = target; c >= 0 && c < width; c += step) {
        if (rows[row]?.[c]?.kind !== "empty") {
          event.preventDefault()
          focusCell(row, c)
          return
        }
      }
    }
  }

  return (
    <>
      <div
        ref={gridRef}
        role="grid"
        aria-label={label}
        aria-rowcount={size}
        aria-colcount={width}
        className="mx-auto flex aspect-square w-full max-w-3xl flex-col gap-px rounded-md border-2 border-foreground bg-foreground p-[3px] [container-type:inline-size]"
      >
        {rows.map((cells, row) => (
          <div
            key={row}
            role="row"
            aria-rowindex={row + 1}
            className="grid flex-1 gap-px"
            style={{
              gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`,
              // The block boundary, drawn instead of nested. Without it a flat
              // grid is eighty-one identical squares and the Mandalart's
              // structure disappears.
              marginBottom: row % 3 === 2 && row !== size - 1 ? 2 : undefined,
            }}
          >
            {cells.map((cell, col) => (
              <div
                key={col}
                role="gridcell"
                aria-colindex={col + 1}
                data-cell={`${row}-${col}`}
                className="relative min-w-0"
                style={{ marginRight: col % 3 === 2 && col !== width - 1 ? 2 : undefined }}
              >
                <Cell
                  cell={cell}
                  draft={draft}
                  progress={progress}
                  onClick={onCellClick}
                  compact={compact}
                  position={t("grid.cellPosition", { row: row + 1, col: col + 1 })}
                  tabbable={active[0] === row && active[1] === col}
                  onKeyDown={(event) => onKeyDown(event, row, col)}
                  onFocus={() => setActive([row, col])}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="sr-only">{t("grid.keyboardHint")}</p>
    </>
  )
}

/** The first cell that can hold focus, so the tab stop is never an empty one. */
function firstFocusable(rows: GridCell[][]): [number, number] | null {
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < (rows[row]?.length ?? 0); col++) {
      if (rows[row][col].kind !== "empty") return [row, col]
    }
  }
  return null
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
  position,
  tabbable,
  onKeyDown,
  onFocus,
}: {
  cell: GridCell
  draft: EditorDraft
  progress?: Record<string, ProgressValue>
  onClick?: (cell: GridCell) => void
  compact?: boolean
  /** "row 4, column 7", already translated. */
  position: string
  tabbable: boolean
  onKeyDown: (event: React.KeyboardEvent) => void
  onFocus: () => void
}) {
  const { t } = useLanguage()

  if (cell.kind === "empty") {
    // Still a cell as far as the grid is concerned — a hole in the row would
    // make the column indices lie.
    return (
      <div className="h-full w-full bg-muted">
        <span className="sr-only">
          {position}: {t("grid.emptyCell")}
        </span>
      </div>
    )
  }

  const actionId =
    cell.subgoalId && cell.actionIndex !== null
      ? draft.actions[cell.subgoalId]?.[cell.actionIndex]?.id
      : undefined
  const pct = actionId ? progress?.[actionId] : undefined

  const kind =
    cell.kind === "mainGoal"
      ? t("visualization.mainGoal")
      : cell.kind === "subgoal"
        ? `${t("subgoalReview.subgoal")} ${cell.area}`
        : `${t("detailedActions.action")} ${(cell.actionIndex ?? 0) + 1}`

  return (
    <button
      type="button"
      onClick={() => onClick?.(cell)}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      tabIndex={tabbable ? 0 : -1}
      style={cellStyle(cell)}
      title={cell.metric ? `${cell.content}\n${cell.metric}` : cell.content}
      // Position first: without it a reader hears eighty-one labels and has no
      // idea where any of them sit.
      aria-label={`${position}, ${kind}: ${cell.content}${
        cell.metric ? `. ${cell.metric}` : ""
      }${pct === undefined ? "" : ` — ${pct}%`}`}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden p-1 text-center transition-transform focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
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
          // The container is now the whole grid rather than one block, so the
          // per-cell share of it is a third of what it was.
          fontSize: compact
            ? "max(9.5px, min(1.4cqw, 13px))"
            : "max(12px, min(4.6cqw, 17px))",
        }}
      >
        {cell.content}
      </span>
    </button>
  )
}
