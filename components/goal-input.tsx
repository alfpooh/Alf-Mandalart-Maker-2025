"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useLanguage } from "@/lib/language-context"
import { LanguageSwitch } from "@/components/language-switch"

interface GoalInputProps {
  onGoalSubmit: (goal: string) => void
  isLoading: boolean
}

export function GoalInput({ onGoalSubmit, isLoading }: GoalInputProps) {
  const [goal, setGoal] = useState("")
  const { t } = useLanguage()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (goal.trim()) {
      onGoalSubmit(goal.trim())
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitch />
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-gray-800">{t("app.title")}</CardTitle>
          <p className="text-gray-600 mt-2">{t("goal.input.description")}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="goal" className="text-lg font-medium">
                {t("goal.input.title")}
              </Label>
              <Textarea
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={t("goal.input.placeholder")}
                className="mt-2 min-h-[120px] text-lg"
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full text-lg py-6" disabled={!goal.trim() || isLoading}>
              {isLoading ? `${t("loading")}...` : t("goal.input.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
