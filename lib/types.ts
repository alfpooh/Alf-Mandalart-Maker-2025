export interface MandalartCell {
  id: string
  content: string
  isConfirmed: boolean
  isEditing: boolean
}

export interface MandalartData {
  mainGoal: MandalartCell
  subgoals: MandalartCell[]
  detailedActions: { [subgoalId: string]: MandalartCell[] }
}

export type AppStep = "input" | "review-subgoals" | "generate-details" | "review-details" | "visualization"
