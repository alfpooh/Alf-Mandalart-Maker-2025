"use client"

import { useState } from "react"
import { GoalInput } from "@/components/goal-input"
import { SubgoalReview } from "@/components/subgoal-review"
import { DetailedActionsReview } from "@/components/detailed-actions-review"
import { MandalartVisualization } from "@/components/mandalart-visualization"
import { generateSubgoals, generateDetailedActions } from "@/lib/actions"
import type { MandalartData, MandalartCell, AppStep } from "@/lib/types"

export default function MandalartApp() {
  const [step, setStep] = useState<AppStep>("input")
  const [isLoading, setIsLoading] = useState(false)
  const [data, setData] = useState<MandalartData>({
    mainGoal: { id: "main", content: "", isConfirmed: false, isEditing: false },
    subgoals: [],
    detailedActions: {},
  })

  const handleGoalSubmit = async (goal: string) => {
    setIsLoading(true)
    setData((prev) => ({
      ...prev,
      mainGoal: { id: "main", content: goal, isConfirmed: true, isEditing: false },
    }))

    const result = await generateSubgoals(goal)

    if (result.success && result.subgoals) {
      const subgoals: MandalartCell[] = result.subgoals.map((content, index) => ({
        id: `subgoal-${index}`,
        content,
        isConfirmed: false,
        isEditing: false,
      }))

      setData((prev) => ({ ...prev, subgoals }))
      setStep("review-subgoals")
    }

    setIsLoading(false)
  }

  const handleSubgoalUpdate = (index: number, content: string) => {
    setData((prev) => ({
      ...prev,
      subgoals: prev.subgoals.map((sg, i) => (i === index ? { ...sg, content } : sg)),
    }))
  }

  const handleSubgoalConfirm = (index: number) => {
    setData((prev) => ({
      ...prev,
      subgoals: prev.subgoals.map((sg, i) => (i === index ? { ...sg, isConfirmed: true, isEditing: false } : sg)),
    }))
  }

  const handleSubgoalReject = async (index: number) => {
    setIsLoading(true)
    const result = await generateSubgoals(data.mainGoal.content)

    if (result.success && result.subgoals) {
      setData((prev) => ({
        ...prev,
        subgoals: prev.subgoals.map((sg, i) =>
          i === index ? { ...sg, content: result.subgoals![index], isConfirmed: false, isEditing: false } : sg,
        ),
      }))
    }
    setIsLoading(false)
  }

  const handleStartEdit = (index: number) => {
    setData((prev) => ({
      ...prev,
      subgoals: prev.subgoals.map((sg, i) => (i === index ? { ...sg, isEditing: true } : sg)),
    }))
  }

  const handleSaveEdit = (index: number) => {
    setData((prev) => ({
      ...prev,
      subgoals: prev.subgoals.map((sg, i) => (i === index ? { ...sg, isEditing: false, isConfirmed: true } : sg)),
    }))
  }

  const handleAcceptAll = () => {
    setData((prev) => ({
      ...prev,
      subgoals: prev.subgoals.map((sg) => ({ ...sg, isConfirmed: true, isEditing: false })),
    }))
  }

  const handleGenerateDetails = async () => {
    setIsLoading(true)
    setStep("generate-details")

    const detailedActions: { [subgoalId: string]: MandalartCell[] } = {}

    for (const subgoal of data.subgoals) {
      const result = await generateDetailedActions(subgoal.content, data.mainGoal.content)

      if (result.success && result.actions) {
        detailedActions[subgoal.id] = result.actions.map((content, index) => ({
          id: `${subgoal.id}-action-${index}`,
          content,
          isConfirmed: false,
          isEditing: false,
        }))
      }
    }

    setData((prev) => ({ ...prev, detailedActions }))
    setStep("review-details")
    setIsLoading(false)
  }

  const handleActionUpdate = (subgoalId: string, actionIndex: number, content: string) => {
    setData((prev) => ({
      ...prev,
      detailedActions: {
        ...prev.detailedActions,
        [subgoalId]: prev.detailedActions[subgoalId].map((action, i) =>
          i === actionIndex ? { ...action, content } : action,
        ),
      },
    }))
  }

  const handleActionConfirm = (subgoalId: string, actionIndex: number) => {
    setData((prev) => ({
      ...prev,
      detailedActions: {
        ...prev.detailedActions,
        [subgoalId]: prev.detailedActions[subgoalId].map((action, i) =>
          i === actionIndex ? { ...action, isConfirmed: true, isEditing: false } : action,
        ),
      },
    }))
  }

  const handleActionReject = async (subgoalId: string, actionIndex: number) => {
    const subgoal = data.subgoals.find((sg) => sg.id === subgoalId)
    if (!subgoal) return

    setIsLoading(true)
    const result = await generateDetailedActions(subgoal.content, data.mainGoal.content)

    if (result.success && result.actions) {
      setData((prev) => ({
        ...prev,
        detailedActions: {
          ...prev.detailedActions,
          [subgoalId]: prev.detailedActions[subgoalId].map((action, i) =>
            i === actionIndex
              ? { ...action, content: result.actions![actionIndex], isConfirmed: false, isEditing: false }
              : action,
          ),
        },
      }))
    }
    setIsLoading(false)
  }

  const handleActionStartEdit = (subgoalId: string, actionIndex: number) => {
    setData((prev) => ({
      ...prev,
      detailedActions: {
        ...prev.detailedActions,
        [subgoalId]: prev.detailedActions[subgoalId].map((action, i) =>
          i === actionIndex ? { ...action, isEditing: true } : action,
        ),
      },
    }))
  }

  const handleActionSaveEdit = (subgoalId: string, actionIndex: number) => {
    setData((prev) => ({
      ...prev,
      detailedActions: {
        ...prev.detailedActions,
        [subgoalId]: prev.detailedActions[subgoalId].map((action, i) =>
          i === actionIndex ? { ...action, isEditing: false, isConfirmed: true } : action,
        ),
      },
    }))
  }

  const handleAcceptAllActions = (subgoalId: string) => {
    setData((prev) => ({
      ...prev,
      detailedActions: {
        ...prev.detailedActions,
        [subgoalId]: prev.detailedActions[subgoalId].map((action) => ({
          ...action,
          isConfirmed: true,
          isEditing: false,
        })),
      },
    }))
  }

  const handleComplete = () => {
    setStep("visualization")
  }

  const handleRestart = () => {
    setStep("input")
    setData({
      mainGoal: { id: "main", content: "", isConfirmed: false, isEditing: false },
      subgoals: [],
      detailedActions: {},
    })
  }

  if (step === "input") {
    return <GoalInput onGoalSubmit={handleGoalSubmit} isLoading={isLoading} />
  }

  if (step === "review-subgoals") {
    return (
      <SubgoalReview
        mainGoal={data.mainGoal.content}
        subgoals={data.subgoals}
        onSubgoalUpdate={handleSubgoalUpdate}
        onSubgoalConfirm={handleSubgoalConfirm}
        onSubgoalReject={handleSubgoalReject}
        onAllConfirmed={handleGenerateDetails}
        onStartEdit={handleStartEdit}
        onSaveEdit={handleSaveEdit}
        onAcceptAll={handleAcceptAll}
      />
    )
  }

  if (step === "generate-details") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Generating detailed actions for each subgoal...</p>
        </div>
      </div>
    )
  }

  if (step === "review-details") {
    return (
      <DetailedActionsReview
        mainGoal={data.mainGoal.content}
        subgoals={data.subgoals}
        detailedActions={data.detailedActions}
        onActionUpdate={handleActionUpdate}
        onActionConfirm={handleActionConfirm}
        onActionReject={handleActionReject}
        onStartEdit={handleActionStartEdit}
        onSaveEdit={handleActionSaveEdit}
        onComplete={handleComplete}
        onAcceptAllActions={handleAcceptAllActions}
      />
    )
  }

  if (step === "visualization") {
    return <MandalartVisualization data={data} onRestart={handleRestart} />
  }

  return null
}
