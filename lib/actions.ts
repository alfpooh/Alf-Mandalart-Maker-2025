"use server"

import { groq } from "@ai-sdk/groq"
import { generateText } from "ai"

// Detect language of the input text
function detectLanguage(text: string): string {
  // Simple language detection - check for Korean characters
  const koreanRegex = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/
  if (koreanRegex.test(text)) {
    return "Korean"
  }
  return "English"
}

export async function generateSubgoals(mainGoal: string) {
  try {
    const language = detectLanguage(mainGoal)
    const languageInstruction =
      language === "Korean" ? "모든 응답을 한국어로 작성하세요." : "Write all responses in English."

    const { text } = await generateText({
      model: groq("llama-3.1-8b-instant"),
      prompt: `${languageInstruction}

Break down this main goal into exactly 8 specific, actionable subgoals: "${mainGoal}"

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
      const genericText =
        language === "Korean"
          ? `${mainGoal}을(를) 위한 추가 단계 (${subgoals.length + 1})`
          : `Additional step for: ${mainGoal} (${subgoals.length + 1})`
      subgoals.push(genericText)
    }

    return { success: true, subgoals }
  } catch (error) {
    console.error("Error generating subgoals:", error)

    const language = detectLanguage(mainGoal)

    // Fallback: generate default subgoals if all AI approaches fail
    const fallbackSubgoals =
      language === "Korean"
        ? [
            `${mainGoal} 계획 및 준비`,
            `${mainGoal} 요구사항 조사`,
            `${mainGoal}에 필요한 기술 개발`,
            `${mainGoal}을 위한 자원 생성`,
            `${mainGoal}을 향한 행동 단계`,
            `${mainGoal}을 위한 추진력 구축`,
            `${mainGoal} 진행상황 모니터링`,
            `${mainGoal} 완료 및 달성`,
          ]
        : [
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
    const language = detectLanguage(mainGoal)
    const languageInstruction =
      language === "Korean" ? "모든 응답을 한국어로 작성하세요." : "Write all responses in English."

    const { text } = await generateText({
      model: groq("llama-3.1-8b-instant"),
      prompt: `${languageInstruction}

For the subgoal "${subgoal}" which contributes to the main goal "${mainGoal}", generate exactly 8 specific, actionable steps or tasks.

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
      const genericText =
        language === "Korean"
          ? `${subgoal}을(를) 위한 추가 단계 (${actions.length + 1})`
          : `Additional step for: ${subgoal} (${actions.length + 1})`
      actions.push(genericText)
    }

    return { success: true, actions }
  } catch (error) {
    console.error("Error generating detailed actions:", error)

    const language = detectLanguage(mainGoal)

    // Fallback: generate default actions if all AI approaches fail
    const fallbackActions =
      language === "Korean"
        ? [
            `${subgoal} 조사 및 계획`,
            `${subgoal}을 위한 구체적 목표 설정`,
            `${subgoal}을 위한 일정 생성`,
            `${subgoal}에 필요한 자원 식별`,
            `${subgoal}을 향한 첫 번째 행동 단계`,
            `${subgoal} 진행상황 모니터링`,
            `${subgoal}을 위한 전략 조정`,
            `${subgoal} 완료 및 평가`,
          ]
        : [
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
