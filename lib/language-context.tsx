"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"

export type Language = "en" | "ko" | "ja" | "fi"

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string) => string
}

const translations = {
  en: {
    // Main navigation
    "language.switch": "Language",
    "app.title": "Mandalart Goal Planner",

    // Goal input
    "goal.input.title": "What is your main goal?",
    "goal.input.placeholder": "Enter your main goal here...",
    "goal.input.submit": "Generate Subgoals",
    "goal.input.description":
      "Enter a clear and specific goal that you want to achieve. The AI will help you break it down into actionable subgoals.",

    // Subgoal review
    "subgoal.review.title": "Review Your Subgoals",
    "subgoal.review.description":
      "Review the generated subgoals for your main goal. You can edit, confirm, or regenerate each one.",
    "subgoal.review.accept.all": "Accept All",
    "subgoal.review.generate.details": "Generate Detailed Actions",
    "subgoal.confirm": "Confirm",
    "subgoal.reject": "Regenerate",
    "subgoal.edit": "Edit",
    "subgoal.save": "Save",

    // Detailed actions
    "actions.review.title": "Review Detailed Actions",
    "actions.review.description": "Review the specific actions for each subgoal. Customize them to fit your needs.",
    "actions.accept.all": "Accept All Actions",
    "actions.complete": "Complete Planning",
    "actions.generating": "Generating detailed actions for each subgoal...",

    // Visualization
    "visualization.title": "Your Mandalart Plan",
    "visualization.restart": "Start New Plan",
    "visualization.download": "Download as PDF",
    "visualization.main.goal": "Main Goal",

    // Common
    loading: "Loading...",
    back: "Back",
    next: "Next",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
  },
  ko: {
    // Main navigation
    "language.switch": "언어",
    "app.title": "만다라트 목표 계획기",

    // Goal input
    "goal.input.title": "주요 목표가 무엇인가요?",
    "goal.input.placeholder": "여기에 주요 목표를 입력하세요...",
    "goal.input.submit": "하위 목표 생성",
    "goal.input.description":
      "달성하고자 하는 명확하고 구체적인 목표를 입력하세요. AI가 실행 가능한 하위 목표로 나누어 도와드립니다.",

    // Subgoal review
    "subgoal.review.title": "하위 목표 검토",
    "subgoal.review.description":
      "주요 목표에 대해 생성된 하위 목표를 검토하세요. 각각을 편집, 확인 또는 재생성할 수 있습니다.",
    "subgoal.review.accept.all": "모두 승인",
    "subgoal.review.generate.details": "세부 행동 생성",
    "subgoal.confirm": "확인",
    "subgoal.reject": "재생성",
    "subgoal.edit": "편집",
    "subgoal.save": "저장",

    // Detailed actions
    "actions.review.title": "세부 행동 검토",
    "actions.review.description":
      "각 하위 목표에 대한 구체적인 행동을 검토하세요. 필요에 맞게 사용자 정의할 수 있습니다.",
    "actions.accept.all": "모든 행동 승인",
    "actions.complete": "계획 완료",
    "actions.generating": "각 하위 목표에 대한 세부 행동을 생성하고 있습니다...",

    // Visualization
    "visualization.title": "당신의 만다라트 계획",
    "visualization.restart": "새 계획 시작",
    "visualization.download": "PDF로 다운로드",
    "visualization.main.goal": "주요 목표",

    // Common
    loading: "로딩 중...",
    back: "뒤로",
    next: "다음",
    edit: "편집",
    save: "저장",
    cancel: "취소",
  },
  ja: {
    // Main navigation
    "language.switch": "言語",
    "app.title": "マンダラート目標プランナー",

    // Goal input
    "goal.input.title": "あなたの主な目標は何ですか？",
    "goal.input.placeholder": "ここに主な目標を入力してください...",
    "goal.input.submit": "サブゴール生成",
    "goal.input.description":
      "達成したい明確で具体的な目標を入力してください。AIが実行可能なサブゴールに分解してお手伝いします。",

    // Subgoal review
    "subgoal.review.title": "サブゴールの確認",
    "subgoal.review.description":
      "主な目標に対して生成されたサブゴールを確認してください。それぞれを編集、確認、または再生成できます。",
    "subgoal.review.accept.all": "すべて承認",
    "subgoal.review.generate.details": "詳細アクション生成",
    "subgoal.confirm": "確認",
    "subgoal.reject": "再生成",
    "subgoal.edit": "編集",
    "subgoal.save": "保存",

    // Detailed actions
    "actions.review.title": "詳細アクションの確認",
    "actions.review.description":
      "各サブゴールの具体的なアクションを確認してください。ニーズに合わせてカスタマイズできます。",
    "actions.accept.all": "すべてのアクションを承認",
    "actions.complete": "計画完了",
    "actions.generating": "各サブゴールの詳細アクションを生成しています...",

    // Visualization
    "visualization.title": "あなたのマンダラート計画",
    "visualization.restart": "新しい計画を開始",
    "visualization.download": "PDFでダウンロード",
    "visualization.main.goal": "主な目標",

    // Common
    loading: "読み込み中...",
    back: "戻る",
    next: "次へ",
    edit: "編集",
    save: "保存",
    cancel: "キャンセル",
  },
  fi: {
    // Main navigation
    "language.switch": "Kieli",
    "app.title": "Mandalart Tavoitesuunnittelija",

    // Goal input
    "goal.input.title": "Mikä on päätavoitteesi?",
    "goal.input.placeholder": "Syötä päätavoitteesi tähän...",
    "goal.input.submit": "Luo alatavoitteet",
    "goal.input.description":
      "Syötä selkeä ja tarkka tavoite, jonka haluat saavuttaa. AI auttaa jakamaan sen toiminnallisiin alatavoitteisiin.",

    // Subgoal review
    "subgoal.review.title": "Tarkista alatavoitteesi",
    "subgoal.review.description":
      "Tarkista päätavoitteellesi luodut alatavoitteet. Voit muokata, vahvistaa tai luoda uudelleen jokaisen.",
    "subgoal.review.accept.all": "Hyväksy kaikki",
    "subgoal.review.generate.details": "Luo yksityiskohtaiset toimet",
    "subgoal.confirm": "Vahvista",
    "subgoal.reject": "Luo uudelleen",
    "subgoal.edit": "Muokkaa",
    "subgoal.save": "Tallenna",

    // Detailed actions
    "actions.review.title": "Tarkista yksityiskohtaiset toimet",
    "actions.review.description": "Tarkista kunkin alatavoitteen tarkat toimet. Mukauta ne tarpeisiisi sopiviksi.",
    "actions.accept.all": "Hyväksy kaikki toimet",
    "actions.complete": "Viimeistele suunnittelu",
    "actions.generating": "Luodaan yksityiskohtaisia toimia jokaiselle alatavoitteelle...",

    // Visualization
    "visualization.title": "Sinun Mandalart-suunnitelmasi",
    "visualization.restart": "Aloita uusi suunnitelma",
    "visualization.download": "Lataa PDF:nä",
    "visualization.main.goal": "Päätavoite",

    // Common
    loading: "Ladataan...",
    back: "Takaisin",
    next: "Seuraava",
    edit: "Muokkaa",
    save: "Tallenna",
    cancel: "Peruuta",
  },
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en")

  useEffect(() => {
    const saved = localStorage.getItem("mandalart-language") as Language
    if (saved && ["en", "ko", "ja", "fi"].includes(saved)) {
      setLanguageState(saved)
    }
  }, [])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem("mandalart-language", lang)
  }

  const t = (key: string): string => {
    return translations[language][key as keyof (typeof translations)[typeof language]] || key
  }

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}
