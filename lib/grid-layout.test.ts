/**
 * Tests for the row-major view of the grid.
 *
 * The mapping from nine 3×3 blocks to nine rows of nine is easy to get subtly
 * wrong — a transposed block puts an action under the wrong area and nothing
 * looks broken. These pin it down.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildBlocks, CENTRE, GRID_SIZE, gridRows } from "./grid-layout.ts"
import type { EditorCell, EditorDraft } from "./types.ts"

function cell(id: string, content: string): EditorCell {
  return { id, content, metric: null, isConfirmed: true, isEditing: false }
}

function draft(): EditorDraft {
  const subgoals = Array.from({ length: 8 }, (_, i) => cell(`s${i}`, `area${i}`))
  const actions: Record<string, EditorCell[]> = {}
  for (const [i, subgoal] of subgoals.entries()) {
    actions[subgoal.id] = Array.from({ length: 8 }, (_, j) => cell(`a${i}-${j}`, `a${i}-${j}`))
  }
  return {
    id: "plan",
    mainGoal: "goal",
    language: "ko",
    step: "visualization",
    subgoals,
    actions,
    dependencies: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

const rows = () => gridRows(buildBlocks(draft()))

describe("gridRows", () => {
  it("is nine rows of nine — all 81 cells, none lost or repeated", () => {
    const r = rows()
    assert.equal(r.length, GRID_SIZE)
    for (const row of r) assert.equal(row.length, GRID_SIZE)
    assert.equal(r.flat().length, 81)
  })

  it("puts the main goal at the very centre of the grid", () => {
    assert.equal(rows()[4][4].kind, "mainGoal")
    assert.equal(rows()[4][4].content, "goal")
  })

  it("keeps every cell of a block together in its 3×3 corner", () => {
    // Top-left block is area 1: rows 0-2, columns 0-2, its subgoal in the middle.
    const r = rows()
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        assert.equal(r[row][col].area, 1, `cell ${row},${col} should belong to area 1`)
      }
    }
    assert.equal(r[1][1].kind, "subgoal")
  })

  it("matches the blocks it was built from, cell for cell", () => {
    const blocks = buildBlocks(draft())
    const r = gridRows(blocks)
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const block = blocks[Math.floor(row / 3) * 3 + Math.floor(col / 3)]
        const within = (row % 3) * 3 + (col % 3)
        assert.deepEqual(r[row][col], block.cells[within], `mismatch at ${row},${col}`)
      }
    }
  })

  it("places each area's subgoal at the centre of its own block", () => {
    const r = rows()
    for (const [row, col] of [[1, 1], [1, 4], [1, 7], [4, 1], [4, 7], [7, 1], [7, 4], [7, 7]]) {
      assert.equal(r[row][col].kind, "subgoal", `expected a subgoal at ${row},${col}`)
      assert.equal(r[row][col].isBlockCentre, true)
    }
    void CENTRE
  })

  it("mirrors an area's position: area 1 top-left, area 8 bottom-right", () => {
    const r = rows()
    assert.equal(r[1][1].content, "area0")
    assert.equal(r[7][7].content, "area7")
  })

  it("fills gaps rather than throwing when a block is missing", () => {
    assert.equal(gridRows([])[0][0].kind, "empty")
  })
})
