"use client"

import type React from "react"
import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Download, Printer } from "lucide-react"
import html2canvas from "html2canvas"
import jsPDF from "jspdf"

interface MandalartData {
  mainGoal: { id: string; content: string; isConfirmed: boolean; isEditing: boolean }
  subgoals: { id: string; content: string; isConfirmed: boolean; isEditing: boolean }[]
  detailedActions: { [subgoalId: string]: { id: string; content: string; isConfirmed: boolean; isEditing: boolean }[] }
}

interface MandalartVisualizationProps {
  data: MandalartData
  onRestart: () => void
  onUpdateMainGoal?: (content: string) => void
  onUpdateSubgoal?: (index: number, content: string) => void
  onUpdateAction?: (subgoalId: string, actionIndex: number, content: string) => void
}

interface CellData {
  content: string
  colorClass: string
  type: "mainGoal" | "subgoal" | "action" | "empty"
  id?: string
  subgoalIndex?: number
  actionIndex?: number
  subgoalId?: string
}

export const MandalartVisualization: React.FC<MandalartVisualizationProps> = ({
  data,
  onRestart,
  onUpdateMainGoal,
  onUpdateSubgoal,
  onUpdateAction,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCell, setEditingCell] = useState<CellData | null>(null)
  const [editContent, setEditContent] = useState("")
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)
  const printContentRef = useRef<HTMLDivElement>(null)

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

  const handleCellClick = (cell: CellData) => {
    if (cell.content.trim() === "") return // Don't open modal for empty cells

    setEditingCell(cell)
    setEditContent(cell.content)
    setIsModalOpen(true)
  }

  const handleSave = () => {
    if (!editingCell) return

    if (editingCell.type === "mainGoal" && onUpdateMainGoal) {
      onUpdateMainGoal(editContent)
    } else if (editingCell.type === "subgoal" && onUpdateSubgoal && editingCell.subgoalIndex !== undefined) {
      onUpdateSubgoal(editingCell.subgoalIndex, editContent)
    } else if (
      editingCell.type === "action" &&
      onUpdateAction &&
      editingCell.subgoalId &&
      editingCell.actionIndex !== undefined
    ) {
      onUpdateAction(editingCell.subgoalId, editingCell.actionIndex, editContent)
    }

    setIsModalOpen(false)
    setEditingCell(null)
    setEditContent("")
  }

  const handleCancel = () => {
    setIsModalOpen(false)
    setEditingCell(null)
    setEditContent("")
  }

  const handlePrint = () => {
    window.print()
  }

  const downloadPDF = async () => {
    if (!printContentRef.current) return

    setIsGeneratingPDF(true)

    try {
      // Create a new jsPDF instance
      const pdf = new jsPDF("p", "mm", "a4")
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 15

      // Add title
      pdf.setFontSize(18)
      pdf.text("Mandalart Goal Planner", pageWidth / 2, margin + 10, { align: "center" })

      // Add date
      pdf.setFontSize(10)
      const currentDate = new Date().toLocaleDateString("ko-KR")
      pdf.text(`Generated: ${currentDate}`, pageWidth / 2, margin + 20, { align: "center" })

      // Capture the chart as image
      const canvas = await html2canvas(printContentRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      })

      const imgData = canvas.toDataURL("image/png")
      const imgWidth = pageWidth - margin * 2
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      // Add chart image
      let yPosition = margin + 30
      if (yPosition + imgHeight > pageHeight - margin) {
        pdf.addPage()
        yPosition = margin
      }

      pdf.addImage(imgData, "PNG", margin, yPosition, imgWidth, imgHeight)

      // Add new page for text content
      pdf.addPage()
      yPosition = margin

      // Add main goal
      pdf.setFontSize(14)
      pdf.text("Main Goal:", margin, yPosition)
      yPosition += 8
      pdf.setFontSize(12)
      const mainGoalLines = pdf.splitTextToSize(data.mainGoal.content, pageWidth - margin * 2)
      pdf.text(mainGoalLines, margin, yPosition)
      yPosition += mainGoalLines.length * 6 + 10

      // Add subgoals and actions
      data.subgoals.forEach((subgoal, index) => {
        if (yPosition > pageHeight - 40) {
          pdf.addPage()
          yPosition = margin
        }

        pdf.setFontSize(12)
        pdf.text(`${index + 1}. ${subgoal.content}`, margin, yPosition)
        yPosition += 8

        const actions = data.detailedActions[subgoal.id] || []
        if (actions.length > 0) {
          pdf.setFontSize(10)
          actions.forEach((action, actionIndex) => {
            if (yPosition > pageHeight - 20) {
              pdf.addPage()
              yPosition = margin
            }
            const actionLines = pdf.splitTextToSize(`  ${actionIndex + 1}. ${action.content}`, pageWidth - margin * 2)
            pdf.text(actionLines, margin, yPosition)
            yPosition += actionLines.length * 5
          })
        }
        yPosition += 5
      })

      // Save the PDF
      const fileName = `Mandalart_${data.mainGoal.content.substring(0, 20).replace(/[^a-zA-Z0-9가-힣]/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`
      pdf.save(fileName)
    } catch (error) {
      console.error("Error generating PDF:", error)
      alert("PDF 생성 중 오류가 발생했습니다.")
    } finally {
      setIsGeneratingPDF(false)
    }
  }

  const createGrid = (): CellData[][] => {
    const gridSize = 9
    const grid: CellData[][] = Array(gridSize)
      .fill(null)
      .map(() =>
        Array(gridSize).fill({
          content: "",
          colorClass: "bg-gray-50 text-gray-400 cursor-default",
          type: "empty" as const,
        }),
      )

    // Place central goal in the center
    grid[4][4] = {
      content: data.mainGoal.content,
      colorClass: `${colors.mainGoal} cursor-pointer hover:opacity-80`,
      type: "mainGoal",
      id: data.mainGoal.id,
    }

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
        colorClass: `${colors.subgoals[index] || "bg-gray-400 text-white"} cursor-pointer hover:opacity-80`,
        type: "subgoal",
        id: subgoal.id,
        subgoalIndex: index,
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
              colorClass: `${colors.actions[subgoalIndex] || "bg-gray-100 text-gray-600"} cursor-pointer hover:opacity-80`,
              type: "action",
              id: actions[actionIndex].id,
              subgoalId: subgoal.id,
              actionIndex: actionIndex,
            }
            actionIndex++
          }
        }
      }
    })

    return grid
  }

  const grid = createGrid()

  const getCellTypeLabel = (type: string) => {
    switch (type) {
      case "mainGoal":
        return "Main Goal"
      case "subgoal":
        return "Subgoal"
      case "action":
        return "Action Item"
      default:
        return "Cell"
    }
  }

  return (
    <>
      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-content,
          .print-content * {
            visibility: visible;
          }
          .print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
          .print-chart {
            page-break-after: always;
          }
          .print-details {
            page-break-before: always;
          }
        }
      `}</style>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex flex-col items-center">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6 no-print">
            <h2 className="text-3xl font-bold">Mandalart Visualization</h2>
            <div className="flex gap-2">
              <Button onClick={handlePrint} className="flex items-center gap-2">
                <Printer className="w-4 h-4" />
                인쇄하기
              </Button>
              <Button onClick={downloadPDF} disabled={isGeneratingPDF} className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                {isGeneratingPDF ? "PDF 생성 중..." : "PDF 다운로드"}
              </Button>
            </div>
          </div>

          {/* Print Content */}
          <div ref={printContentRef} className="print-content">
            {/* Print Header */}
            <div className="text-center mb-6 print:mb-4">
              <h1 className="text-2xl font-bold text-gray-800 mb-2">Mandalart Goal Planner</h1>
              <p className="text-gray-600 text-sm">생성일: {new Date().toLocaleDateString("ko-KR")}</p>
            </div>

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
              <p className="text-center text-sm text-gray-600 mt-2 no-print">
                Click on any cell to view details and edit
              </p>
            </div>

            {/* Mandalart Chart */}
            <div className="mb-8 print-chart">
              <div className="grid grid-cols-9 gap-1 border-2 border-gray-600 shadow-lg rounded-md overflow-hidden bg-white">
                {grid.map((row, rowIndex) =>
                  row.map((cell, colIndex) => (
                    <div
                      key={`${rowIndex}-${colIndex}`}
                      className={`w-20 h-20 border border-gray-300 flex items-center justify-center font-medium break-words text-center transition-all hover:scale-105 ${cell.colorClass}`}
                      style={{ fontSize: "0.5rem", lineHeight: "1.1" }}
                      onClick={() => handleCellClick(cell)}
                    >
                      <span className="p-1">{cell.content}</span>
                    </div>
                  )),
                )}
              </div>
            </div>

            {/* Detailed Content */}
            <div className="bg-white p-6 rounded-lg shadow-sm print-details">
              <h2 className="text-xl font-bold text-center mb-6">📝 상세 내용</h2>

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-indigo-600 mb-2">🎯 메인 목표</h3>
                  <div className="pl-4 border-l-4 border-indigo-200 bg-indigo-50 p-3 rounded">
                    <p className="text-gray-800">{data.mainGoal.content}</p>
                  </div>
                </div>

                <hr className="border-gray-300 my-6" />

                {data.subgoals.map((subgoal, index) => (
                  <div key={`subgoal-${subgoal.id}`} className="space-y-3">
                    <h3 className="text-md font-bold text-gray-800 bg-gray-100 p-2 rounded">
                      {index + 1}. {subgoal.content}
                    </h3>

                    {data.detailedActions[subgoal.id] && data.detailedActions[subgoal.id].length > 0 && (
                      <div className="pl-4">
                        <h4 className="text-sm font-semibold text-gray-600 mb-2">액션 아이템:</h4>
                        <div className="space-y-1">
                          {data.detailedActions[subgoal.id].map((action, actionIndex) => (
                            <div key={`action-${action.id}`} className="flex items-start text-sm text-gray-700">
                              <span className="text-blue-500 mr-2 font-medium min-w-[20px]">{actionIndex + 1}.</span>
                              <span>{action.content}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {index < data.subgoals.length - 1 && <hr className="border-gray-200 my-4" />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section Labels */}
          <div className="mt-4 grid grid-cols-3 gap-8 text-center text-sm text-gray-600 no-print">
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

          <div className="text-center mt-8 no-print">
            <button
              onClick={onRestart}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-colors"
            >
              Restart
            </button>
          </div>
        </div>

        {/* Edit Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Badge variant="outline">{getCellTypeLabel(editingCell?.type || "")}</Badge>
                Edit Content
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Current Content:</label>
                {editingCell?.type === "mainGoal" ? (
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Enter your main goal..."
                    className="min-h-[100px]"
                  />
                ) : (
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Enter content..."
                    className="min-h-[80px]"
                  />
                )}
              </div>

              {editingCell?.type === "action" && (
                <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                  <strong>Related Subgoal:</strong>{" "}
                  {editingCell.subgoalId
                    ? data.subgoals.find((sg) => sg.id === editingCell.subgoalId)?.content || "Unknown"
                    : "Unknown"}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!editContent.trim()}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
