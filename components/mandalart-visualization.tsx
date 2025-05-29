"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, RotateCcw } from "lucide-react"
import type { MandalartData } from "@/lib/types"

interface MandalartVisualizationProps {
  data: MandalartData
  onRestart: () => void
}

export function MandalartVisualization({ data, onRestart }: MandalartVisualizationProps) {
  // Create the 9x9 grid mapping
  const createGrid = () => {
    const grid = Array(9)
      .fill(null)
      .map(() => Array(9).fill(""))

    // Place main goal in center
    grid[4][4] = data.mainGoal.content

    // Place subgoals around center
    const subgoalPositions = [
      [3, 3],
      [3, 4],
      [3, 5],
      [4, 3],
      [4, 5],
      [5, 3],
      [5, 4],
      [5, 5],
    ]

    data.subgoals.forEach((subgoal, index) => {
      const [row, col] = subgoalPositions[index]
      grid[row][col] = subgoal.content
    })

    // Place detailed actions in their respective 3x3 sections
    data.subgoals.forEach((subgoal, subgoalIndex) => {
      const actions = data.detailedActions[subgoal.id] || []
      const sectionRow = Math.floor(subgoalIndex / 3) * 3
      const sectionCol = (subgoalIndex % 3) * 3

      // Skip the center position of each 3x3 section (that's where the subgoal is)
      let actionIndex = 0
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (r === 1 && c === 1) continue // Skip center
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

  const getCellStyle = (row: number, col: number) => {
    // Main goal (center)
    if (row === 4 && col === 4) {
      return "bg-blue-600 text-white font-bold text-center"
    }

    // Subgoals (around center)
    const subgoalPositions = [
      [3, 3],
      [3, 4],
      [3, 5],
      [4, 3],
      [4, 5],
      [5, 3],
      [5, 4],
      [5, 5],
    ]

    if (subgoalPositions.some(([r, c]) => r === row && c === col)) {
      return "bg-blue-100 font-semibold text-center border-2 border-blue-300"
    }

    // Regular action cells
    return "bg-white text-sm border border-gray-200 hover:bg-gray-50"
  }

  const handlePrint = () => {
    // Add print styles to the document
    const printStyles = `
      @media print {
        @page {
          size: A4;
          margin: 0.5in;
        }
        body * {
          visibility: hidden;
        }
        .print-area, .print-area * {
          visibility: visible;
        }
        .print-area {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
        }
        .grid {
          max-width: 100% !important;
          font-size: 8px !important;
        }
        .grid > div {
          min-height: 60px !important;
          padding: 4px !important;
          font-size: 7px !important;
        }
        .no-print {
          display: none !important;
        }
      }
    `

    // Create style element
    const styleElement = document.createElement("style")
    styleElement.textContent = printStyles
    document.head.appendChild(styleElement)

    // Add print-area class to the mandalart grid
    const gridElement = document.querySelector(".grid")
    if (gridElement) {
      gridElement.classList.add("print-area")
    }

    // Print
    window.print()

    // Clean up
    setTimeout(() => {
      document.head.removeChild(styleElement)
      if (gridElement) {
        gridElement.classList.remove("print-area")
      }
    }, 1000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        <Card className="mb-6">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-gray-800">Your Complete Mandalart</CardTitle>
            <p className="text-gray-600">A visual representation of your goal broken down into actionable steps</p>
            <div className="flex gap-4 justify-center mt-4 no-print">
              <Button onClick={onRestart} variant="outline">
                <RotateCcw className="w-4 h-4 mr-2" />
                Create New Mandalart
              </Button>
              <Button onClick={handlePrint}>
                <Download className="w-4 h-4 mr-2" />
                Print/Save
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-9 gap-1 max-w-6xl mx-auto">
              {grid.map((row, rowIndex) =>
                row.map((cell, colIndex) => (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    className={`
                      min-h-[80px] p-2 flex items-center justify-center text-xs
                      ${getCellStyle(rowIndex, colIndex)}
                    `}
                  >
                    <span className="text-center leading-tight">
                      {(() => {
                        const subgoalPositions = [
                          [3, 3],
                          [3, 4],
                          [3, 5],
                          [4, 3],
                          [4, 5],
                          [5, 3],
                          [5, 4],
                          [5, 5],
                        ]
                        const isSubgoal = subgoalPositions.some(([r, c]) => r === rowIndex && c === colIndex)

                        if (isSubgoal && cell) {
                          // Display subgoals with "Goal: " prefix for better clarity
                          return cell.startsWith("Goal: ") ? cell : `Goal: ${cell}`
                        }
                        return cell
                      })()}
                    </span>
                  </div>
                )),
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">How to Use Your Mandalart</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <div className="w-4 h-4 bg-blue-600 rounded mt-1"></div>
                <div>
                  <strong>Main Goal (Center):</strong> Your primary objective that everything else supports.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-4 h-4 bg-blue-100 border-2 border-blue-300 rounded mt-1"></div>
                <div>
                  <strong>Subgoals (Blue):</strong> Eight key areas that will help you achieve your main goal.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-4 h-4 bg-white border border-gray-200 rounded mt-1"></div>
                <div>
                  <strong>Actions (White):</strong> Specific, actionable steps for each subgoal.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
