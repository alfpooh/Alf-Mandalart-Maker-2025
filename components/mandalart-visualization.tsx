"use client"

import type React from "react"
import type { EditorDraft } from "@/lib/types"
import { useLanguage } from "@/lib/language-context"
import { MandalartGrid } from "@/components/mandalart-grid"
import { ExecutionOrder } from "@/components/execution-order"
import type { GridCell } from "@/lib/grid-layout"
import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Download, Printer, FileText, Lock } from "lucide-react"
import { track } from "@/lib/analytics"
import html2canvas from "html2canvas"
import { exportPlanPdf } from "@/lib/pdf"

interface MandalartVisualizationProps {
  draft: EditorDraft
  onBack: () => void
  onRestart: () => void
  onUpdateMainGoal?: (content: string) => void
  onUpdateSubgoal?: (index: number, content: string) => void
  onUpdateAction?: (subgoalId: string, actionIndex: number, content: string) => void
  onRemoveDependency?: (actionId: string, dependsOnId: string) => void
  /** True for visitors without an account: exports are account-only. */
  locked?: boolean
  onShowTeaser?: () => void
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
  draft,
  onBack,
  onRestart,
  onUpdateMainGoal,
  onUpdateSubgoal,
  onUpdateAction,
  onRemoveDependency,
  locked = false,
  onShowTeaser,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCell, setEditingCell] = useState<CellData | null>(null)
  const [editContent, setEditContent] = useState("")
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const printContentRef = useRef<HTMLDivElement>(null)
  // Only the grid goes into the PDF as an image; the rest is written as text.
  const gridRef = useRef<HTMLDivElement>(null)
  const { t } = useLanguage()

  // Phase 1 rebuilds this grid; until then the draft is shaped to what the
  // existing render already expects rather than rewriting 600 lines twice.
  const data = {
    mainGoal: { id: "main", content: draft.mainGoal, isConfirmed: true, isEditing: false },
    subgoals: draft.subgoals,
    detailedActions: draft.actions,
  }

  // Legend swatches only; the grid itself reads the --area-* tokens directly.
  const colors = { mainGoal: "bg-[var(--area-center)] text-white" }

  const handleCellClick = (cell: GridCell) => {
    if (cell.content.trim() === "" || cell.kind === "empty") return
    setEditingCell({
      content: cell.content,
      colorClass: "",
      type: cell.kind,
      subgoalIndex: cell.subgoalIndex ?? undefined,
      actionIndex: cell.actionIndex ?? undefined,
      subgoalId: cell.subgoalId ?? undefined,
    })
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

  const generateTextContent = (): string => {
    const currentDate = new Date().toLocaleDateString("ko-KR")
    let textContent = `===============================================
MANDALART GOAL PLANNER
===============================================

생성일: ${currentDate}

===============================================
🎯 메인 목표
===============================================
${data.mainGoal.content}

===============================================
📋 서브목표 및 액션 아이템
===============================================

`

    data.subgoals.forEach((subgoal, index) => {
      textContent += `${index + 1}. ${subgoal.content}\n`
      textContent += `${"=".repeat(50)}\n`

      const actions = data.detailedActions[subgoal.id] || []
      if (actions.length > 0) {
        textContent += `액션 아이템:\n`
        actions.forEach((action, actionIndex) => {
          textContent += `   ${actionIndex + 1}. ${action.content}\n`
        })
      } else {
        textContent += `액션 아이템: 없음\n`
      }
      textContent += `\n`
    })

    textContent += `===============================================
📊 MANDALART 구조 (9x9 그리드)
===============================================

중앙: ${data.mainGoal.content}

서브목표 위치:
1. 좌상단: ${data.subgoals[0]?.content || "없음"}
2. 상단중앙: ${data.subgoals[1]?.content || "없음"}
3. 우상단: ${data.subgoals[2]?.content || "없음"}
4. 좌측중앙: ${data.subgoals[3]?.content || "없음"}
5. 우측중앙: ${data.subgoals[4]?.content || "없음"}
6. 좌하단: ${data.subgoals[5]?.content || "없음"}
7. 하단중앙: ${data.subgoals[6]?.content || "없음"}
8. 우하단: ${data.subgoals[7]?.content || "없음"}

===============================================
📝 개발 요약
===============================================

프로젝트명: Mandalart Goal Planner
개발 기간: ${currentDate}
기술 스택: Next.js, React, TypeScript, Tailwind CSS, Groq AI

주요 기능:
1. AI 기반 목표 분해 (메인 목표 → 8개 서브목표 → 각 8개 액션)
2. 인터랙티브 목표 편집 및 확인 시스템
3. 9x9 Mandalart 시각화 차트
4. 클릭하여 편집 가능한 셀
5. PDF 다운로드 및 인쇄 기능
6. TXT 파일 다운로드 기능
7. 한국어/영어 자동 언어 매칭

개발 단계:
1. 목표 입력 → AI 서브목표 생성
2. 서브목표 검토 및 편집
3. AI 액션 아이템 생성
4. 액션 아이템 검토 및 편집
5. 최종 Mandalart 시각화

특징:
- Groq AI 통합으로 빠른 목표 분해
- 사용자 친화적 편집 인터페이스
- 컬러 코딩으로 구분된 시각적 표현
- 다양한 출력 형식 지원 (PDF, 인쇄, TXT)

===============================================
🎨 색상 구조
===============================================

메인 목표: 인디고 (중앙)
서브목표 색상:
1. 빨강 (좌상단)
2. 주황 (상단중앙)
3. 노랑 (우상단)
4. 초록 (좌측중앙)
5. 파랑 (우측중앙)
6. 보라 (좌하단)
7. 분홍 (하단중앙)
8. 청록 (우하단)

액션 아이템: 각 서브목표의 연한 색상

===============================================
📱 사용 방법
===============================================

1. 메인 목표 입력
2. AI가 생성한 8개 서브목표 검토/편집
3. AI가 생성한 각 서브목표별 8개 액션 아이템 검토/편집
4. 최종 Mandalart 차트에서 셀 클릭하여 추가 편집 가능
5. PDF, 인쇄, TXT 형식으로 결과물 다운로드

===============================================
END OF DOCUMENT
===============================================`

    return textContent
  }

  const downloadTXT = () => {
    const textContent = generateTextContent()
    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `Mandalart_${data.mainGoal.content.substring(0, 20).replace(/[^a-zA-Z0-9가-힣]/g, "_")}_${new Date().toISOString().split("T")[0]}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const downloadPDF = async () => {
    setIsGeneratingPDF(true)
    setPdfError(null)
    try {
      await exportPlanPdf(draft, gridRef.current, {
        title: t("visualization.title"),
        generated: t("visualization.generatedDate"),
        mainGoal: t("visualization.mainGoalLabel"),
        area: t("subgoalReview.subgoal"),
        actions: t("visualization.actionsLabel"),
        metric: t("detailedActions.metric"),
      })
    } catch (error) {
      // The old code alerted with a hardcoded Korean string regardless of
      // language, and said nothing about what had failed.
      console.error("[pdf]", error)
      setPdfError("visualization.pdfFailed")
    } finally {
      setIsGeneratingPDF(false)
    }
  }

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
        <div className="w-full max-w-7xl mx-auto">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-6 no-print">
            <h2 className="text-2xl sm:text-3xl font-bold">{t("visualization.title")}</h2>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onBack} variant="outline">
                {t("visualization.back")}
              </Button>

              {locked ? (
                // Downloads are an account feature. Rather than hiding them,
                // show what exists and say what opens it — a hidden feature
                // gives nobody a reason to sign in.
                <Button
                  onClick={() => {
                    track("export_blocked")
                    onShowTeaser?.()
                  }}
                  variant="outline"
                  className="gap-2"
                >
                  <Lock className="w-4 h-4" />
                  {t("visualization.exportsLocked")}
                </Button>
              ) : (
                <>
                  <Button onClick={downloadTXT} className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {t("visualization.txtDownload")}
                  </Button>
                  <Button onClick={handlePrint} className="flex items-center gap-2">
                    <Printer className="w-4 h-4" />
                    {t("visualization.print")}
                  </Button>
                  <Button
                    onClick={downloadPDF}
                    disabled={isGeneratingPDF}
                    className="flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {isGeneratingPDF
                      ? t("visualization.pdfGenerating")
                      : t("visualization.pdfDownload")}
                  </Button>
                </>
              )}
            </div>

            {pdfError && (
              <p
                role="alert"
                className="w-full rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800"
              >
                {t(pdfError)}
              </p>
            )}
          </div>

          {/* Print Content */}
          <div ref={printContentRef} className="print-content">
            {/* Print Header */}
            <div className="text-center mb-6 print:mb-4">
              <h1 className="text-2xl font-bold text-gray-800 mb-2">Mandalart Goal Planner</h1>
              <p className="text-gray-600 text-sm">생성일: {new Date().toLocaleDateString("ko-KR")}</p>
            </div>

            {/* Legend */}
            <div className="mb-6 rounded-lg bg-white p-4 shadow-sm">
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded" style={{ background: "var(--area-center)" }} />
                  <span>{t("visualization.mainGoal")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex" aria-hidden="true">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <div
                        key={n}
                        className="h-4 w-2 first:rounded-l last:rounded-r"
                        style={{ background: `var(--area-${n})` }}
                      />
                    ))}
                  </div>
                  <span>{t("visualization.subgoals")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex" aria-hidden="true">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <div
                        key={n}
                        className="h-4 w-2 first:rounded-l last:rounded-r"
                        style={{ background: `var(--area-${n}-soft)` }}
                      />
                    ))}
                  </div>
                  <span>{t("visualization.actionItems")}</span>
                </div>
              </div>
              <p className="mt-2 text-center text-sm text-gray-600 no-print">
                {t("visualization.clickToEdit")}
              </p>
            </div>

            {/* Mandalart Chart */}
            <div className="mb-8 print-chart" ref={gridRef}>
              <MandalartGrid draft={draft} onCellClick={handleCellClick} />
            </div>

            {/* What can be started now */}
            <div className="mb-8">
              <ExecutionOrder draft={draft} onRemoveDependency={onRemoveDependency} />
            </div>

            {/* Detailed Content */}
            <div className="bg-white p-6 rounded-lg shadow-sm print-details">
              <h2 className="text-xl font-bold text-center mb-6">{t("visualization.detailedContent")}</h2>

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-indigo-600 mb-2">{t("visualization.mainGoalLabel")}</h3>
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
                        <h4 className="text-sm font-semibold text-gray-600 mb-2">{t("visualization.actionsLabel")}</h4>
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

          {/* Area key — eight colours, each tying a block to its subgoal. */}
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4 no-print">
            {draft.subgoals.map((subgoal, index) => (
              <div key={subgoal.id} className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 flex-none rounded-sm"
                  style={{ background: `var(--area-${index + 1})` }}
                />
                <span className="truncate text-gray-700">{subgoal.content}</span>
              </div>
            ))}
          </div>

          <div className="text-center mt-8 no-print">
            <button
              onClick={onRestart}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-colors"
            >
              {t("visualization.restart")}
            </button>
          </div>
        </div>

        {/* Edit Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Badge variant="outline">{getCellTypeLabel(editingCell?.type || "")}</Badge>
                {t("visualization.editContent")}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">{t("visualization.currentContent")}</label>
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
                {t("visualization.cancel")}
              </Button>
              <Button onClick={handleSave} disabled={!editContent.trim()}>
                {t("visualization.saveChanges")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
