"use client"

import type React from "react"
import type { EditorDraft } from "@/lib/types"
import { useLanguage } from "@/lib/language-context"
import { MandalartGrid } from "@/components/mandalart-grid"
import { ExecutionOrder } from "@/components/execution-order"
import type { GridCell } from "@/lib/grid-layout"
import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  Download,
  Printer,
  FileText,
  Lock,
  Presentation,
  Image as ImageIcon,
  Table,
} from "lucide-react"
import { track } from "@/lib/analytics"
import html2canvas from "html2canvas"
import { exportPlanPdf } from "@/lib/pdf"
import { exportPlanPptx } from "@/lib/pptx"
import { exportCsv, exportGridPng, exportMarkdown } from "@/lib/export-data"

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
  const [isGeneratingPPTX, setIsGeneratingPPTX] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [busyExport, setBusyExport] = useState<"png" | "md" | "csv" | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const printContentRef = useRef<HTMLDivElement>(null)
  // Only the grid goes into the PDF as an image; the rest is written as text.
  const gridRef = useRef<HTMLDivElement>(null)
  const { t, language } = useLanguage()
  // Filled after mount rather than during render: this component is server
  // rendered too, and the server's clock is UTC while the reader's is not, so
  // across midnight the two produce different dates and hydration mismatches.
  const [generatedOn, setGeneratedOn] = useState("")
  useEffect(() => {
    setGeneratedOn(new Date().toLocaleDateString(language))
  }, [language])

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

  const docLabels = {
    mainGoal: t("visualization.mainGoalLabel"),
    metric: t("detailedActions.metric"),
    readyTitle: t("order.readyTitle"),
    waitingOn: t("order.waitsFor"),
  }

  const csvHeaders = {
    areaNo: t("csv.areaNo"),
    area: t("csv.area"),
    no: t("csv.no"),
    action: t("csv.action"),
    metric: t("detailedActions.metric"),
    progress: t("csv.progress"),
    ready: t("csv.ready"),
    waitingOn: t("csv.waitingOn"),
    yes: t("csv.yes"),
    no_: t("csv.noValue"),
  }

  const runExport = async (kind: "png" | "md" | "csv") => {
    setBusyExport(kind)
    setExportError(null)
    try {
      if (kind === "png") {
        await exportGridPng(gridRef.current, draft.mainGoal)
      } else if (kind === "md") {
        exportMarkdown(draft, docLabels)
      } else {
        exportCsv(draft, csvHeaders)
      }
    } catch (error) {
      console.error(`[export:${kind}]`, error)
      setExportError("visualization.exportFailed")
    } finally {
      setBusyExport(null)
    }
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

  const downloadPPTX = async () => {
    setIsGeneratingPPTX(true)
    setPdfError(null)
    try {
      await exportPlanPptx(draft, gridRef.current, {
        // Screen headings read oddly on a slide: the cover said "Mandalart
        // visualization" and the grid slide said "Details".
        deckTitle: t("visualization.pptxDeck"),
        overview: t("visualization.pptxOverview"),
        area: t("subgoalReview.subgoal"),
        metric: t("detailedActions.metric"),
        readyTitle: t("order.readyTitle"),
        readyHint: t("order.readyHint"),
        noDeps: t("visualization.pptxNoOrder"),
      })
    } catch (error) {
      console.error("[pptx]", error)
      setPdfError("visualization.pptxFailed")
    } finally {
      setIsGeneratingPPTX(false)
    }
  }

  const getCellTypeLabel = (type: string) => {
    switch (type) {
      case "mainGoal":
        return t("visualization.mainGoal")
      case "subgoal":
        return t("subgoalReview.subgoal")
      case "action":
        return t("visualization.actionItems")
      default:
        return t("visualization.cell")
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
                  <Button
                    onClick={() => runExport("png")}
                    disabled={busyExport !== null}
                    className="flex items-center gap-2"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {busyExport === "png"
                      ? t("visualization.pngGenerating")
                      : t("visualization.pngDownload")}
                  </Button>
                  <Button
                    onClick={() => runExport("md")}
                    disabled={busyExport !== null}
                    className="flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    {t("visualization.mdDownload")}
                  </Button>
                  <Button
                    onClick={() => runExport("csv")}
                    disabled={busyExport !== null}
                    className="flex items-center gap-2"
                  >
                    <Table className="w-4 h-4" />
                    {t("visualization.csvDownload")}
                  </Button>
                  <Button onClick={handlePrint} className="flex items-center gap-2">
                    <Printer className="w-4 h-4" />
                    {t("visualization.print")}
                  </Button>
                  <Button
                    onClick={downloadPPTX}
                    disabled={isGeneratingPPTX}
                    className="flex items-center gap-2"
                  >
                    <Presentation className="w-4 h-4" />
                    {isGeneratingPPTX
                      ? t("visualization.pptxGenerating")
                      : t("visualization.pptxDownload")}
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

            {(pdfError || exportError) && (
              <p
                role="alert"
                className="w-full rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800"
              >
                {t(pdfError ?? exportError ?? "")}
              </p>
            )}
          </div>

          {/* Print Content */}
          <div ref={printContentRef} className="print-content">
            {/* Print Header */}
            <div className="text-center mb-6 print:mb-4">
              <h1 className="text-2xl font-bold text-gray-800 mb-2">{t("app.title")}</h1>
              <p className="text-gray-600 text-sm">
                {t("visualization.generatedDate")} {generatedOn}
              </p>
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
                    placeholder={t("visualization.enterMainGoal")}
                    className="min-h-[100px]"
                  />
                ) : (
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder={t("visualization.enterContent")}
                    className="min-h-[80px]"
                  />
                )}
              </div>

              {editingCell?.type === "action" && (
                <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                  <strong>{t("visualization.relatedSubgoal")}</strong>{" "}
                  {editingCell.subgoalId
                    ? data.subgoals.find((sg) => sg.id === editingCell.subgoalId)?.content || t("visualization.unknown")
                    : t("visualization.unknown")}
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
