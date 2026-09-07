"use client"

import { AlertTriangle, Check, Edit2, RotateCw, Save } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/lib/language-context"
import { type EditorCell } from "@/lib/types"

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
}: DetailedActionsReviewProps) {
  const { t } = useLanguage()

  const all = Object.values(detailedActions).flat()
  const confirmed = all.filter((action) => action.isConfirmed).length
  const canComplete = all.length > 0 && confirmed === all.length && failedSubgoals.length === 0

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
                    <div className="flex items-center gap-2">
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
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {actions.length === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-500">
                      {t("detailedActions.empty")}
                    </p>
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
                            <Input
                              value={action.content}
                              onChange={(e) =>
                                onActionUpdate(subgoal.id, actionIndex, e.target.value)
                              }
                              className="mb-2"
                              autoFocus
                              aria-label={`${t("detailedActions.action")} ${actionIndex + 1}`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") onSaveEdit(subgoal.id, actionIndex)
                              }}
                            />
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
                              <Button
                                size="sm"
                                className="flex-1"
                                onClick={() => onSaveEdit(subgoal.id, actionIndex)}
                              >
                                <Save className="mr-1 h-4 w-4" aria-hidden="true" />
                                {t("detailedActions.save")}
                              </Button>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => onStartEdit(subgoal.id, actionIndex)}
                                >
                                  <Edit2 className="mr-1 h-4 w-4" aria-hidden="true" />
                                  {t("detailedActions.edit")}
                                </Button>
                                {!action.isConfirmed && (
                                  <Button
                                    size="sm"
                                    onClick={() => onActionConfirm(subgoal.id, actionIndex)}
                                  >
                                    <Check className="h-4 w-4" aria-hidden="true" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
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
