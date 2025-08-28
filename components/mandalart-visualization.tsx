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
  // Color scheme for different sections
  const colors = {
    mainGoal: "bg-indigo-600 text-white",
    subgoals: [
      "bg-red-400 text-white", // Top-left subgoal
      "bg-orange-400 text-white", // Top-center subgoal
      "bg-yellow-400 text-gray-800", // Top-right subgoal
      "bg-green-400 text-white", // Middle-left subgoal
      "bg-blue-400 text-white", // Middle-right subgoal
      "bg-purple-400 text-white", // Bottom-left subgoal
      "bg-pink-400 text-white", // Bottom-center subgoal
      "bg-teal-400 text-white", // Bottom-right subgoal
    ],
    actions: [
      "bg-red-100 text-red-800", // Actions for subgoal 0
      "bg-orange-100 text-orange-800", // Actions for subgoal 1
      "bg-yellow-100 text-yellow-800", // Actions for subgoal 2
      "bg-green-100 text-green-800", // Actions for subgoal 3
      "bg-blue-100 text-blue-800", // Actions for subgoal 4
      "bg-purple-100 text-purple-800", // Actions for subgoal 5
      "bg-pink-100 text-pink-800", // Actions for subgoal 6
      "bg-teal-100 text-teal-800", // Actions for subgoal 7
    ],
  }

  const createGrid = (): { content: string; colorClass: string }[][] => {
    const gridSize = 9
    const grid: { content: string; colorClass: string }[][] = Array(gridSize)
      .fill(null)
      .map(() => Array(gridSize).fill({ content: "", colorClass: "bg-gray-50 text-gray-400" }))

    // Place central goal in the center
    grid[4][4] = { content: data.mainGoal.content, colorClass: colors.mainGoal }

    // Place subgoals around the central goal
    const subgoalPositions = [
      [1, 1], // Top-left
      [1, 4], // Top-center
      [1, 7], // Top-right
      [4, 1], // Middle-left
      [4, 7], // Middle-right
      [7, 1], // Bottom-left
      [7, 4], // Bottom-center
      [7, 7], // Bottom-right
    ]

    data.subgoals.forEach((subgoal, index) => {
      const [row, col] = subgoalPositions[index]
      grid[row][col] = {
        content: subgoal.content,
        colorClass: colors.subgoals[index] || "bg-gray-400 text-white",
      }
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
            grid[sectionRow + r][sectionCol + c] = {
              content: actions[actionIndex].content,
              colorClass: colors.actions[subgoalIndex] || "bg-gray-100 text-gray-600",
            }
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

        {/* Legend */}
        <div className="mb-6 p-4 bg-white rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-3 text-center">Color Legend</h3>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${colors.mainGoal}`}></div>
              <span>Main Goal</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-400"></div>
              <span>Subgoals</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-100 border border-red-200"></div>
              <span>Action Items</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-9 gap-1 border-2 border-gray-600 shadow-lg rounded-md overflow-hidden bg-white">
          {grid.map((row, rowIndex) =>
            row.map((cell, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={`w-20 h-20 border border-gray-300 flex items-center justify-center font-medium break-words text-center transition-all hover:scale-105 ${cell.colorClass}`}
                style={{ fontSize: "0.5rem", lineHeight: "1.1" }}
              >
                <span className="p-1">{cell.content}</span>
              </div>
            )),
          )}
        </div>

        {/* Section Labels */}
        <div className="mt-4 grid grid-cols-3 gap-8 text-center text-sm text-gray-600">
          <div className="space-y-1">
            <div className="font-semibold">Top Sections</div>
            <div className="flex justify-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-red-400"></div>
                <span>1</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-orange-400"></div>
                <span>2</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-yellow-400"></div>
                <span>3</span>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold">Middle Sections</div>
            <div className="flex justify-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-400"></div>
                <span>4</span>
              </div>
              <div className={`w-3 h-3 rounded ${colors.mainGoal}`}></div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-blue-400"></div>
                <span>5</span>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold">Bottom Sections</div>
            <div className="flex justify-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-purple-400"></div>
                <span>6</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-pink-400"></div>
                <span>7</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-teal-400"></div>
                <span>8</span>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-8">
          <button
            onClick={onRestart}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-colors"
          >
            Restart
          </button>
        </div>
      </div>
    </div>
  )
}
