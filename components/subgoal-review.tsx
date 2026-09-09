"use client"

import { Check, Edit2, Save } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/lib/language-context"
import { SUBGOAL_COUNT, type EditorCell } from "@/lib/types"

interface SubgoalReviewProps {
  mainGoal: string
  subgoals: EditorCell[]
  onSubgoalUpdate: (index: number, content: string) => void
  onSubgoalConfirm: (index: number) => void
  onAllConfirmed: () => void
  onStartEdit: (index: number) => void
  onSaveEdit: (index: number) => void
  onAcceptAll: () => void
}

export function SubgoalReview({
  mainGoal,
  subgoals,
  onSubgoalUpdate,
  onSubgoalConfirm,
  onAllConfirmed,
  onStartEdit,
  onSaveEdit,
  onAcceptAll,
}: SubgoalReviewProps) {
  const { t } = useLanguage()
  const confirmedCount = subgoals.filter((sg) => sg.isConfirmed).length
  const allConfirmed = confirmedCount === SUBGOAL_COUNT

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="mx-auto max-w-6xl">
        <Card className="mb-6">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">{t("subgoalReview.title")}</CardTitle>
            <p className="text-gray-600">
              {t("subgoalReview.mainGoal")} <span className="font-semibold">{mainGoal}</span>
            </p>
            <div className="flex flex-col items-center gap-3">
              <Badge variant="outline" className="mx-auto tabular-nums">
                {confirmedCount}/{SUBGOAL_COUNT} {t("subgoalReview.progress")}
              </Badge>
              {!allConfirmed && (
                <Button onClick={onAcceptAll} variant="outline" className="bg-transparent px-6">
                  {t("subgoalReview.acceptAll")}
                </Button>
              )}
            </div>
          </CardHeader>
        </Card>

        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {subgoals.map((subgoal, index) => (
            <Card
              key={subgoal.id}
              className={`transition-all ${
                subgoal.isConfirmed ? "bg-green-50 ring-2 ring-green-500" : "hover:shadow-md"
              }`}
            >
              <CardContent className="p-4">
                <div className="mb-2 text-sm text-gray-500">
                  {t("subgoalReview.subgoal")} {index + 1}
                </div>

                {subgoal.isEditing ? (
                  <Input
                    value={subgoal.content}
                    onChange={(e) => onSubgoalUpdate(index, e.target.value)}
                    className="mb-3"
                    autoFocus
                    aria-label={`${t("subgoalReview.subgoal")} ${index + 1}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSaveEdit(index)
                    }}
                  />
                ) : (
                  <p className="mb-3 text-gray-800">{subgoal.content}</p>
                )}

                <div className="flex gap-2">
                  {subgoal.isEditing ? (
                    <Button size="sm" onClick={() => onSaveEdit(index)} className="flex-1">
                      <Save className="mr-1 h-4 w-4" aria-hidden="true" />
                      {t("subgoalReview.save")}
                    </Button>
                  ) : subgoal.isConfirmed ? (
                    <div className="flex w-full gap-2">
                      <Badge variant="default" className="flex-1 justify-center">
                        <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                        {t("subgoalReview.confirmed")}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onStartEdit(index)}
                        aria-label={`${t("subgoalReview.edit")} ${index + 1}`}
                      >
                        <Edit2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onStartEdit(index)}
                        className="flex-1"
                      >
                        <Edit2 className="mr-1 h-4 w-4" aria-hidden="true" />
                        {t("subgoalReview.edit")}
                      </Button>
                      <Button size="sm" onClick={() => onSubgoalConfirm(index)}>
                        <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                        {t("subgoalReview.confirm")}
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {allConfirmed && (
          <div className="text-center">
            <Button onClick={onAllConfirmed} size="lg" className="px-8">
              {t("subgoalReview.generateActions")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
