"use client"

import { AlertTriangle, Check, Edit2, Plus, RotateCw, Save, Trash2, Undo2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/lib/language-context"
import { ACTIONS_PER_SUBGOAL, type EditorCell } from "@/lib/types"

interface DetailedActionsReviewProps {
  mainGoal: string
  subgoals: EditorCell[]
  detailedActions: Record<string, EditorCell[]>
  /** Indices of areas whose generation failed, so they can be retried alone. */
  failedSubgoals: number[]
  onActionUpdate: (subgoalId: string, actionIndex: number, content: string) => void
  onActionConfirm: (subgoalId: string, actionIndex: number) => void
  onStartEdit: (subgoalId: string, actionIndex: number) => void
  onSaveEdit: (subgoalId: string, actionIndex: number) => void
  onAcceptAllActions: (subgoalId: string) => void
  onComplete: () => void
  onRetrySubgoal: () => void
  /** Adds one empty action to an area, for filling a gap by hand. */
  onAddAction: (subgoalId: string) => void
  /** The measure is a field of its own, editable alongside the text. */
  onMetricUpdate: (subgoalId: string, actionIndex: number, metric: string) => void
  onRemoveAction: (subgoalId: string, actionIndex: number) => void
  /** The last deletion, while it can still be taken back. */
  undoable: { content: string; area: number } | null
  onUndoRemove: () => void
  onDismissUndo: () => void
  /** Regenerates one area. Works from the area itself, so it survives a reload
   *  — the failure banner does not, being component state. */
  onRegenerateArea: (subgoalIndex: number) => void
  regeneratingArea: number | null
  /** Why the last regeneration failed, already translated. */
  areaError: string | null
  onDismissAreaError: () => void
}

export function DetailedActionsReview({
  mainGoal,
  subgoals,
  detailedActions,
  failedSubgoals,
  onActionUpdate,
  onActionConfirm,
  onStartEdit,
  onSaveEdit,
  onAcceptAllActions,
  onComplete,
  onRetrySubgoal,
  onAddAction,
  onMetricUpdate,
  onRemoveAction,
  undoable,
  onUndoRemove,
  onDismissUndo,
  onRegenerateArea,
  regeneratingArea,
  areaError,
  onDismissAreaError,
}: DetailedActionsReviewProps) {
  const { t } = useLanguage()

  const all = Object.values(detailedActions).flat()
  const confirmed = all.filter((action) => action.isConfirmed).length
  const blank = all.filter((action) => action.content.trim().length === 0).length
  // An area left empty no longer blocks finishing — it can be filled by hand,
  // and a plan of fifty-six actions someone chose beats one they cannot leave.
  const canComplete = all.length > 0 && confirmed === all.length && blank === 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="mx-auto max-w-7xl">
        <Card className="mb-6">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">{t("detailedActions.title")}</CardTitle>
            <p className="text-gray-600">
              {t("detailedActions.mainGoal")} <span className="font-semibold">{mainGoal}</span>
            </p>
            <Badge variant="outline" className="mx-auto tabular-nums">
              {confirmed}/{all.length} {t("detailedActions.progress")}
            </Badge>
          </CardHeader>
        </Card>

        {failedSubgoals.length > 0 && (
          <Card className="mb-6 border-amber-300 bg-amber-50">
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <AlertTriangle className="h-5 w-5 flex-none text-amber-600" aria-hidden="true" />
              <p className="flex-1 text-sm text-amber-900">
                {failedSubgoals.length} {t("detailedActions.failed")}
              </p>
              <Button size="sm" variant="outline" onClick={onRetrySubgoal}>
                <RotateCw className="mr-1 h-4 w-4" aria-hidden="true" />
                {t("detailedActions.retry")}
              </Button>
            </CardContent>
          </Card>
        )}

        {areaError && (
          <Card className="mb-6 border-red-300 bg-red-50">
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <AlertTriangle className="h-5 w-5 flex-none text-red-600" aria-hidden="true" />
              <p role="alert" className="flex-1 text-sm text-red-900">
                {areaError}
              </p>
              <Button size="sm" variant="outline" onClick={onDismissAreaError}>
                {t("detailedActions.dismiss")}
              </Button>
            </CardContent>
          </Card>
        )}

        {undoable && (
          <Card className="mb-6 border-slate-300 bg-slate-50">
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <p role="status" className="flex-1 text-sm text-slate-800">
                {t("detailedActions.removed", { content: undoable.content })}
              </p>
              <Button size="sm" onClick={onUndoRemove}>
                <Undo2 className="mr-1 h-4 w-4" aria-hidden="true" />
                {t("detailedActions.undo")}
              </Button>
              <Button size="sm" variant="outline" onClick={onDismissUndo}>
                {t("detailedActions.dismiss")}
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          {subgoals.map((subgoal, subgoalIndex) => {
            const actions = detailedActions[subgoal.id] ?? []
            const subgoalConfirmed = actions.filter((a) => a.isConfirmed).length

            return (
              <Card key={subgoal.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-lg">
                      {subgoalIndex + 1}. {subgoal.content}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="tabular-nums">
                        {subgoalConfirmed}/{actions.length}
                      </Badge>
                      {actions.length > 0 && subgoalConfirmed < actions.length && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onAcceptAllActions(subgoal.id)}
                        >
                          {t("detailedActions.acceptAll")}
                        </Button>
                      )}
                      {actions.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={regeneratingArea !== null}
                          onClick={() => {
                            // Regenerating replaces every action here. Ask only
                            // when there is work to lose — accepting or editing
                            // an area is the signal that someone read it.
                            const reviewed = actions.some((a) => a.isConfirmed)
                            if (reviewed && !window.confirm(t("detailedActions.confirmRegenerate"))) {
                              return
                            }
                            onRegenerateArea(subgoalIndex)
                          }}
                        >
                          <RotateCw
                            className={`mr-1 h-4 w-4 ${
                              regeneratingArea === subgoalIndex
                                ? "animate-spin motion-reduce:animate-none"
                                : ""
                            }`}
                            aria-hidden="true"
                          />
                          {regeneratingArea === subgoalIndex
                            ? t("detailedActions.regenerating")
                            : t("detailedActions.regenerate")}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {actions.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                      <p className="text-sm text-gray-500">{t("detailedActions.empty")}</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => onRegenerateArea(subgoalIndex)}
                          disabled={regeneratingArea !== null}
                        >
                          <RotateCw
                            className={`mr-1 h-4 w-4 ${
                              regeneratingArea === subgoalIndex
                                ? "animate-spin motion-reduce:animate-none"
                                : ""
                            }`}
                            aria-hidden="true"
                          />
                          {regeneratingArea === subgoalIndex
                            ? t("detailedActions.regenerating")
                            : t("detailedActions.regenerateArea")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onAddAction(subgoal.id)}
                        >
                          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                          {t("detailedActions.addManually")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {actions.map((action, actionIndex) => (
                        <div
                          key={action.id}
                          className={`rounded-lg border p-3 transition-colors ${
                            action.isConfirmed
                              ? "border-green-300 bg-green-50"
                              : "border-gray-200 bg-white"
                          }`}
                        >
                          {action.isEditing ? (
                            <>
                              <Input
                                value={action.content}
                                onChange={(e) =>
                                  onActionUpdate(subgoal.id, actionIndex, e.target.value)
                                }
                                className="mb-2"
                                autoFocus
                                aria-label={`${t("detailedActions.action")} ${actionIndex + 1}`}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && action.content.trim()) {
                                    onSaveEdit(subgoal.id, actionIndex)
                                  }
                                }}
                              />
                              {/* Editable rather than display-only: a hand-added
                                  action had no way to get a measure at all. */}
                              <label
                                className="mb-1 block text-xs text-gray-500"
                                htmlFor={`${action.id}-metric`}
                              >
                                {t("detailedActions.metricLabel")}
                              </label>
                              <Input
                                id={`${action.id}-metric`}
                                value={action.metric ?? ""}
                                onChange={(e) =>
                                  onMetricUpdate(subgoal.id, actionIndex, e.target.value)
                                }
                                className="mb-2"
                                placeholder={t("detailedActions.metricPlaceholder")}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && action.content.trim()) {
                                    onSaveEdit(subgoal.id, actionIndex)
                                  }
                                }}
                              />
                            </>
                          ) : (
                            <>
                              <p className="mb-1 text-sm text-gray-800">{action.content}</p>
                              {action.metric && (
                                <p className="mb-2 text-xs text-gray-500">
                                  {t("detailedActions.metric")}: {action.metric}
                                </p>
                              )}
                            </>
                          )}

                          <div className="flex gap-2">
                            {action.isEditing ? (
                              <>
                                <Button
                                  size="sm"
                                  className="flex-1"
                                  disabled={action.content.trim().length === 0}
                                  onClick={() => onSaveEdit(subgoal.id, actionIndex)}
                                >
                                  <Save className="mr-1 h-4 w-4" aria-hidden="true" />
                                  {t("detailedActions.save")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onRemoveAction(subgoal.id, actionIndex)}
                                  aria-label={t("detailedActions.remove")}
                                  title={t("detailedActions.remove")}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => onStartEdit(subgoal.id, actionIndex)}
                                  aria-label={t("detailedActions.editAction", {
                                    n: actionIndex + 1,
                                  })}
                                >
                                  <Edit2 className="mr-1 h-4 w-4" aria-hidden="true" />
                                  {t("detailedActions.edit")}
                                </Button>
                                {action.isConfirmed ? (
                                  // Confirmed used to be signalled by the green
                                  // card alone, which is colour-only and says
                                  // nothing to a screen reader.
                                  <Badge variant="default" className="shrink-0">
                                    <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                                    {t("detailedActions.confirmed")}
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => onActionConfirm(subgoal.id, actionIndex)}
                                    aria-label={t("detailedActions.confirmAction", {
                                      n: actionIndex + 1,
                                    })}
                                  >
                                    <Check className="h-4 w-4" aria-hidden="true" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}

                      {actions.length < ACTIONS_PER_SUBGOAL && (
                        <button
                          type="button"
                          onClick={() => onAddAction(subgoal.id)}
                          className="flex min-h-[76px] items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 p-3 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 focus-visible:outline focus-visible:outline-2"
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                          {t("detailedActions.addAction")} ({actions.length}/
                          {ACTIONS_PER_SUBGOAL})
                        </button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {canComplete && (
          <div className="mt-8 text-center">
            <Button onClick={onComplete} size="lg" className="px-8">
              {t("detailedActions.complete")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
