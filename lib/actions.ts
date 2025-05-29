"use server"

import { groq } from "@ai-sdk/groq"
import { generateText, generateObject } from "ai"
import { z } from "zod"

const SubgoalsSchema = z.object({
  subgoals: z.array(z.string()).length(8),
})

const DetailedActionsSchema = z.object({
  actions: z.array(z.string()).length(8),
})

export async function generateSubgoals(mainGoal: string) {
  try {
    // First try with generateObject
    try {
      const { object } = await generateObject({
        model: groq("llama-3.1-8b-instant"),
        schema: SubgoalsSchema,
        prompt: `Break down this main goal into exactly 8 specific, actionable subgoals: "${mainGoal}"
        
        Each subgoal should be:
        - Specific and measurable
        - Directly contributing to the main goal
        - Actionable and realistic
        - Distinct from the other subgoals
        - Written as a clear goal statement
        
        Return exactly 8 subgoals in JSON format.`,
      })

      return { success: true, subgoals: object.subgoals }
    } catch (objectError) {
      console.error("Error with generateObject, falling back to generateText:", objectError)

      // Fall back to generateText if generateObject fails
      const { text } = await generateText({
        model: groq("llama-3.1-8b-instant"),
        prompt: `Break down this main goal into exactly 8 specific, actionable subgoals: "${mainGoal}"
        
        Each subgoal should be:
        - Specific and measurable
        - Directly contributing to the main goal
        - Actionable and realistic
        - Distinct from the other subgoals
        - Written as a clear goal statement
        
        Format your response as a numbered list with exactly 8 items, one subgoal per line.
        1. First subgoal
        2. Second subgoal
        ...and so on.
        
        Do not include any other text or explanations.`,
      })

      // Parse the numbered list response
      const lines = text.split("\n").filter((line) => line.trim() !== "")
      const subgoals = lines
        .map((line) => {
          // Remove numbers and any leading characters
          const match = line.match(/^\d+\.\s*(.+)$/)
          return match ? match[1].trim() : line.trim()
        })
        .filter(Boolean)
        .slice(0, 8) // Ensure we have at most 8 items

      // If we don't have enough subgoals, add generic ones
      while (subgoals.length < 8) {
        subgoals.push(`Additional step for: ${mainGoal} (${subgoals.length + 1})`)
      }

      return { success: true, subgoals }
    }
  } catch (error) {
    console.error("Error generating subgoals:", error)

    // Fallback: generate default subgoals if all AI approaches fail
    const fallbackSubgoals = [
      `Plan and prepare for: ${mainGoal}`,
      `Research requirements for: ${mainGoal}`,
      `Develop skills needed for: ${mainGoal}`,
      `Create resources for: ${mainGoal}`,
      `Take action steps toward: ${mainGoal}`,
      `Build momentum for: ${mainGoal}`,
      `Monitor progress on: ${mainGoal}`,
      `Complete and achieve: ${mainGoal}`,
    ]

    return { success: true, subgoals: fallbackSubgoals }
  }
}

export async function generateDetailedActions(subgoal: string, mainGoal: string) {
  try {
    // First try with generateObject
    try {
      const { object } = await generateObject({
        model: groq("llama-3.1-8b-instant"),
        schema: DetailedActionsSchema,
        prompt: `For the subgoal "${subgoal}" which contributes to the main goal "${mainGoal}", generate exactly 8 specific, actionable steps or tasks.

        Each action should be:
        - Very specific and concrete
        - Something that can be completed in a reasonable timeframe
        - Directly supporting the subgoal
        - Measurable or observable
        - Written as a clear action statement

        Return exactly 8 actions in JSON format.`,
      })

      return { success: true, actions: object.actions }
    } catch (objectError) {
      console.error("Error with generateObject, falling back to generateText:", objectError)

      // Fall back to generateText if generateObject fails
      const { text } = await generateText({
        model: groq("llama-3.1-8b-instant"),
        prompt: `For the subgoal "${subgoal}" which contributes to the main goal "${mainGoal}", generate exactly 8 specific, actionable steps or tasks.

        Each action should be:
        - Very specific and concrete
        - Something that can be completed in a reasonable timeframe
        - Directly supporting the subgoal
        - Measurable or observable
        - Written as a clear action statement

        Format your response as a numbered list with exactly 8 items, one action per line.
        1. First action
        2. Second action
        ...and so on.
        
        Do not include any other text or explanations.`,
      })

      // Parse the numbered list response
      const lines = text.split("\n").filter((line) => line.trim() !== "")
      const actions = lines
        .map((line) => {
          // Remove numbers and any leading characters
          const match = line.match(/^\d+\.\s*(.+)$/)
          return match ? match[1].trim() : line.trim()
        })
        .filter(Boolean)
        .slice(0, 8) // Ensure we have at most 8 items

      // If we don't have enough actions, add generic ones
      while (actions.length < 8) {
        actions.push(`Additional step for: ${subgoal} (${actions.length + 1})`)
      }

      return { success: true, actions }
    }
  } catch (error) {
    console.error("Error generating detailed actions:", error)

    // Fallback: generate default actions if all AI approaches fail
    const fallbackActions = [
      `Research and plan for: ${subgoal}`,
      `Set specific targets for: ${subgoal}`,
      `Create timeline for: ${subgoal}`,
      `Identify resources needed for: ${subgoal}`,
      `Take first action step toward: ${subgoal}`,
      `Monitor progress on: ${subgoal}`,
      `Adjust strategy for: ${subgoal}`,
      `Complete and evaluate: ${subgoal}`,
    ]

    return { success: true, actions: fallbackActions }
  }
}
