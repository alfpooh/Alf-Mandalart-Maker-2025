"use server"

// import { groq } from "@ai-sdk/groq"
// import { generateText } from "ai"

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
  } catch (error) {
    console.error("Error generating subgoals:", error)
    return { success: false, subgoals: [] }
  }
}

export async function generateDetailedActions(subgoal: string, mainGoal: string) {
  try {
    const language = detectLanguage(mainGoal)

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
  } catch (error) {
    console.error("Error generating detailed actions:", error)
    return { success: false, actions: [] }
  }
}
