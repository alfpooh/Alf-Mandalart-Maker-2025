/**
 * How a Mandalart's 81 cells are arranged.
 *
 * The grid is nine 3×3 blocks. The centre block holds the main goal with the
 * eight subgoals around it; each outer block holds one subgoal with its eight
 * actions around it. A subgoal sits at the same relative position inside the
 * centre block as its own block does in the whole grid — that repetition is
 * what makes the 9×9 readable rather than 81 unrelated squares.
 *
 * The previous implementation left the centre block's eight cells empty, so
 * the main goal floated alone and the link between a block and its subgoal was
 * never shown.
 */

import { SUBGOAL_COUNT, type EditorCell, type EditorDraft } from "./types"

/** The centre of a 3×3 block, in reading order. */
export const CENTRE = 4

/**
 * Block position (0–8, reading order) to subgoal index (0–7).
 * The centre position has no subgoal — it is the main goal.
 */
export const POSITION_TO_SUBGOAL: (number | null)[] = [0, 1, 2, 3, null, 4, 5, 6, 7]

/** Subgoal index to its position in the grid. Inverse of the above. */
export const SUBGOAL_TO_POSITION: number[] = [0, 1, 2, 3, 5, 6, 7, 8]

export type CellKind = "mainGoal" | "subgoal" | "action" | "empty"

export interface GridCell {
  kind: CellKind
  content: string
  metric: string | null
  /** 1–8 for anything belonging to an area; null for the main goal. */
  area: number | null
  subgoalIndex: number | null
  subgoalId: string | null
  actionIndex: number | null
  /** True for the middle cell of a block — the subgoal, or the main goal. */
  isBlockCentre: boolean
}

export interface GridBlock {
  /** 0–8 in reading order. */
  position: number
  /** null for the centre block. */
  subgoalIndex: number | null
  area: number | null
  /** The subgoal this block expands, or the main goal for the centre block. */
  title: string
  cells: GridCell[]
}

function emptyCell(): GridCell {
  return {
    kind: "empty",
    content: "",
    metric: null,
    area: null,
    subgoalIndex: null,
    subgoalId: null,
    actionIndex: null,
    isBlockCentre: false,
  }
}

/** The nine blocks, each with its nine cells, ready to render. */
export function buildBlocks(draft: EditorDraft): GridBlock[] {
  const blocks: GridBlock[] = []

  for (let position = 0; position < 9; position++) {
    const subgoalIndex = POSITION_TO_SUBGOAL[position]

    if (subgoalIndex === null) {
      // Centre block: the goal, ringed by the eight areas.
      const cells = Array.from({ length: 9 }, (_, p): GridCell => {
        if (p === CENTRE) {
          return {
            ...emptyCell(),
            kind: "mainGoal",
            content: draft.mainGoal,
            isBlockCentre: true,
          }
        }
        const index = POSITION_TO_SUBGOAL[p]
        const subgoal = index === null ? undefined : draft.subgoals[index]
        if (index === null || !subgoal) return emptyCell()
        return {
          ...emptyCell(),
          kind: "subgoal",
          content: subgoal.content,
          area: index + 1,
          subgoalIndex: index,
          subgoalId: subgoal.id,
        }
      })

      blocks.push({
        position,
        subgoalIndex: null,
        area: null,
        title: draft.mainGoal,
        cells,
      })
      continue
    }

    // Outer block: one area, its subgoal in the middle.
    const subgoal = draft.subgoals[subgoalIndex]
    const actions = subgoal ? (draft.actions[subgoal.id] ?? []) : []
    const area = subgoalIndex + 1

    let actionIndex = 0
    const cells = Array.from({ length: 9 }, (_, p): GridCell => {
      if (p === CENTRE) {
        if (!subgoal) return emptyCell()
        return {
          ...emptyCell(),
          kind: "subgoal",
          content: subgoal.content,
          area,
          subgoalIndex,
          subgoalId: subgoal.id,
          isBlockCentre: true,
        }
      }
      const action = actions[actionIndex]
      const currentIndex = actionIndex
      actionIndex += 1
      if (!action || !subgoal) return emptyCell()
      return {
        ...emptyCell(),
        kind: "action",
        content: action.content,
        metric: action.metric,
        area,
        subgoalIndex,
        subgoalId: subgoal.id,
        actionIndex: currentIndex,
      }
    })

    blocks.push({
      position,
      subgoalIndex,
      area,
      title: subgoal?.content ?? "",
      cells,
    })
  }

  return blocks
}

/** The centre block on its own, for the mobile overview. */
export function centreBlock(blocks: GridBlock[]): GridBlock | undefined {
  return blocks.find((block) => block.subgoalIndex === null)
}

/** The block expanding a given area, for the mobile drill-down. */
export function blockForSubgoal(
  blocks: GridBlock[],
  subgoalIndex: number,
): GridBlock | undefined {
  return blocks.find((block) => block.subgoalIndex === subgoalIndex)
}

/** How many of a plan's areas have all eight actions filled in. */
export function filledAreaCount(draft: EditorDraft): number {
  return draft.subgoals.filter((s) => (draft.actions[s.id]?.length ?? 0) > 0).length
}

export { SUBGOAL_COUNT }
export type { EditorCell }
