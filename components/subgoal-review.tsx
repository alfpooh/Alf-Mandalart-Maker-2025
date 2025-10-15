"use client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Check, X, Edit2, Save } from "lucide-react"
import type { MandalartCell } from "@/lib/types"
import { useLanguage } from "@/lib/language-context"

interface SubgoalReviewProps {
  mainGoal: string
  subgoals: MandalartCell[]
  onSubgoalUpdate: (index: number, content: string) => void
  onSubgoalConfirm: (index: number) => void
  onSubgoalReject: (index: number) => void
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
  onSubgoalReject,
  onAllConfirmed,
  onStartEdit,
  onSaveEdit,
  onAcceptAll,
}: SubgoalReviewProps) {
  const { t } = useLanguage()
  const confirmedCount = subgoals.filter((sg) => sg.isConfirmed).length
  const allConfirmed = confirmedCount === 8

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        <Card className="mb-6">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">{t("subgoalReview.title")}</CardTitle>
            <p className="text-gray-600">
              {t("subgoalReview.mainGoal")} <span className="font-semibold">{mainGoal}</span>
            </p>
            <div className="flex flex-col items-center gap-3">
              <Badge variant="outline" className="mx-auto">
                {confirmedCount}/8 {t("subgoalReview.progress")}
              </Badge>
              {confirmedCount < 8 && (
                <Button onClick={onAcceptAll} variant="outline" className="px-6 bg-transparent">
                  {t("subgoalReview.acceptAll")}
                </Button>
              )}
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[30px] mb-6">
          {subgoals.map((subgoal, index) => (
            <Card
              key={subgoal.id}
              className={`transition-all ${
                subgoal.isConfirmed ? "ring-2 ring-green-500 bg-green-50" : "hover:shadow-md"
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-sm text-gray-500 mb-2">
                      {t("subgoalReview.subgoal")} {index + 1}
                    </div>
                    {subgoal.isEditing ? (
                      <Input
                        value={subgoal.content}
                        onChange={(e) => onSubgoalUpdate(index, e.target.value)}
                        className="mb-3"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            onSaveEdit(index)
                          }
                        }}
                      />
                    ) : (
                      <p className="text-gray-800 mb-3">{subgoal.content}</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  {subgoal.isEditing ? (
                    <Button size="sm" onClick={() => onSaveEdit(index)} className="flex-1">
                      <Save className="w-4 h-4 mr-1" />
                      {t("subgoalReview.save")}
                    </Button>
                  ) : subgoal.isConfirmed ? (
                    <div className="flex gap-2 w-full">
                      <Badge variant="default" className="flex-1 justify-center">
                        <Check className="w-4 h-4 mr-1" />
                        {t("subgoalReview.confirmed")}
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => onStartEdit(index)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onStartEdit(index)} className="flex-1">
                        <Edit2 className="w-4 h-4 mr-1" />
                        {t("subgoalReview.edit")}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => onSubgoalReject(index)}>
                        <X className="w-4 h-4" />
                      </Button>
                      <Button size="sm" onClick={() => onSubgoalConfirm(index)}>
                        <Check className="w-4 h-4" />
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
