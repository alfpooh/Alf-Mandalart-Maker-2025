"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { MandalartCell } from "@/lib/types"

interface DetailedActionsReviewProps {
  mainGoal: string
  subgoals: MandalartCell[]
  detailedActions: { [subgoalId: string]: MandalartCell[] }
  onActionUpdate: (subgoalId: string, actionIndex: number, content: string) => void
  onActionConfirm: (subgoalId: string, actionIndex: number) => void
  onActionReject: (subgoalId: string, actionIndex: number) => void
  onStartEdit: (subgoalId: string, actionIndex: number) => void
  onSaveEdit: (subgoalId: string, actionIndex: number) => void
  onComplete: () => void
  onAcceptAllActions: (subgoalId: string) => void
}

export function DetailedActionsReview({
  mainGoal,
  subgoals,
  detailedActions,
  onActionUpdate,
  onActionConfirm,
  onActionReject,
  onStartEdit,
  onSaveEdit,
  onComplete,
  onAcceptAllActions,
}: DetailedActionsReviewProps) {
  const totalActions = Object.values(detailedActions).flat().length
  const confirmedActions = Object.values(detailedActions)
    .flat()
    .filter((action) => action.isConfirmed).length
  const allConfirmed = confirmedActions === totalActions && totalActions > 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        <Card className="mb-6">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Review Detailed Actions</CardTitle>
            <p className="text-gray-600">
              Main Goal: <span className="font-semibold">{mainGoal}</span>
            </p>
            <Badge variant="outline" className="mx-auto">
              {confirmedActions}/{totalActions} Actions Confirmed
            </Badge>
          </CardHeader>
        </Card>

        <div className="space-y-6">
          {subgoals.map((subgoal) => (
            <Card key={subgoal.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{subgoal.content}</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => onAcceptAllActions(subgoal.id)} className="ml-4">
                    모든 액션 확인
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {detailedActions[subgoal.id]?.map((action, actionIndex) => (
                    <Card
                      key={action.id}
                      className={`transition-all ${
                        action.isConfirmed ? "ring-2 ring-green-500 bg-green-50" : "hover:shadow-sm"
                      }`}
                    >
                      <CardContent className="p-3">
                        {action.isEditing ? (
                          <Input
                            value={action.content}
                            onChange={(e) => onActionUpdate(subgoal.id, actionIndex, e.target.value)}
                            className="mb-2 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                onSaveEdit(subgoal.id, actionIndex)
                              }
                            }}
                          />
                        ) : (
                          <p className="text-sm text-gray-800 mb-2 min-h-[40px]">{action.content}</p>
                        )}

                        <div className="flex gap-1">
                          {action.isEditing ? (
                            <Button
                              size="sm"
                              onClick={() => onSaveEdit(subgoal.id, actionIndex)}
                              className="flex-1 text-xs"
                            >
                              💾
                            </Button>
                          ) : action.isConfirmed ? (
                            <Badge variant="default" className="flex-1 justify-center text-xs">
                              ✅
                            </Badge>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onStartEdit(subgoal.id, actionIndex)}
                                className="flex-1 text-xs p-1"
                              >
                                ✏️
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => onActionReject(subgoal.id, actionIndex)}
                                className="text-xs p-1"
                              >
                                ❌
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => onActionConfirm(subgoal.id, actionIndex)}
                                className="text-xs p-1"
                              >
                                ✅
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {allConfirmed && (
          <div className="text-center mt-8">
            <Button onClick={onComplete} size="lg" className="px-8">
              View Complete Mandalart
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
