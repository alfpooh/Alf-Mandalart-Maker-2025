"use client"

import type React from "react"
import Image from "next/image"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useLanguage } from "@/lib/language-context"

interface GoalInputProps {
  onGoalSubmit: (goal: string) => void
  isLoading: boolean
  /** Message shown when generation failed. The old build silently substituted
   *  placeholder subgoals here, so a failure looked like a result. */
  error?: string | null
}

export function GoalInput({ onGoalSubmit, isLoading, error = null }: GoalInputProps) {
  const [goal, setGoal] = useState("")
  const { t } = useLanguage()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (goal.trim()) {
      onGoalSubmit(goal.trim())
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full bg-white shadow-md">
        <div className="relative w-full h-48 md:h-64 lg:h-80 bg-gray-50">
          <Image
            src="/images/mandalart-cover.png"
            alt={t("banner.alt")}
            fill
            className="object-contain object-center bg-background"
            priority
          />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 bg-border">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-gray-800">{t("goalInput.title")}</CardTitle>
            <p className="text-gray-600 mt-2">{t("goalInput.description")}</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="goal" className="text-lg font-medium">
                  {t("goalInput.label")}
                </Label>
                <Textarea
                  id="goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder={t("goalInput.placeholder")}
                  className="mt-2 min-h-[120px] text-lg"
                  disabled={isLoading}
                />
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                >
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full text-lg py-6" disabled={!goal.trim() || isLoading}>
                {isLoading ? t("goalInput.generating") : t("goalInput.generate")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
