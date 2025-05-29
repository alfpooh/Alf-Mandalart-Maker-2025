"use client"

import type React from "react"

interface MandalartData {
  mainGoal: { id: string; content: string; isConfirmed: boolean; isEditing: boolean }
  subgoals: { id: string; content: string; isConfirmed: boolean; isEditing: boolean }[]
  detailedActions: { [subgoalId: string]: { id: string; content: string; isConfirmed: boolean; isEditing: boolean }[] }
}

interface MandalartVisualizationProps {
  data: MandalartData
  onRestart: () => void
}

export const MandalartVisualization: React.FC<MandalartVisualizationProps> = ({ data, onRestart }) => {
  const createGrid = (): string[][] => {
    const gridSize = 9
    const grid: string[][] = Array(gridSize)
      .fill(null)
      .map(() => Array(gridSize).fill(""))

    // Place central goal in the center
    grid[4][4] = data.mainGoal.content

    // Place subgoals around the central goal
    const subgoalPositions = [
      [1, 1],
      [1, 4],
      [1, 7],
      [4, 1],
      [4, 7],
      [7, 1],
      [7, 4],
      [7, 7],
    ]

    data.subgoals.forEach((subgoal, index) => {
      const [row, col] = subgoalPositions[index]
      grid[row][col] = subgoal.content
    })

    // Place detailed actions in their respective 3x3 sections
    data.subgoals.forEach((subgoal, subgoalIndex) => {
      const actions = data.detailedActions[subgoal.id] || []

      // Map subgoal index to correct 3x3 section position
      const sectionMapping = [
        [0, 0], // subgoal 0 -> top-left section
        [0, 3], // subgoal 1 -> top-center section
        [0, 6], // subgoal 2 -> top-right section
        [3, 0], // subgoal 3 -> middle-left section
        [3, 6], // subgoal 4 -> middle-right section
        [6, 0], // subgoal 5 -> bottom-left section
        [6, 3], // subgoal 6 -> bottom-center section
        [6, 6], // subgoal 7 -> bottom-right section
      ]

      const [sectionRow, sectionCol] = sectionMapping[subgoalIndex] || [0, 0]

      // Place actions around the subgoal in its 3x3 section
      let actionIndex = 0
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (r === 1 && c === 1) continue // Skip center (that's where the subgoal is)
          if (actionIndex < actions.length) {
            grid[sectionRow + r][sectionCol + c] = actions[actionIndex].content
            actionIndex++
          }
        }
      }
    })

    return grid
  }

  const grid = createGrid()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex flex-col items-center">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-6">Mandalart Visualization</h2>
        <div className="grid grid-cols-9 gap-1 border border-gray-600 shadow-lg rounded-md overflow-hidden">
          {grid.map((row, rowIndex) =>
            row.map((cell, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                className="w-20 h-20 border border-gray-600 flex items-center justify-center text-sm font-medium text-gray-800 break-words text-center bg-white"
              >
                {cell}
              </div>
            )),
          )}
        </div>
        <div className="text-center mt-8">
          <button onClick={onRestart} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
            Restart
          </button>
        </div>
      </div>
    </div>
  )
}
