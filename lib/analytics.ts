/**
 * Funnel events.
 *
 * Google Analytics is already loaded in the layout but only ever saw page
 * views, so nothing recorded where people stop. The teaser's per-screen
 * drop-off is the number that decides whether the sign-up flow works, and it
 * cannot be recovered later — an event not sent is gone.
 */

type GtagEvent = (command: "event", name: string, params?: Record<string, unknown>) => void

declare global {
  interface Window {
    gtag?: GtagEvent
  }
}

export type AnalyticsEvent =
  | "teaser_open"
  | "teaser_step"
  | "teaser_signin_click"
  | "teaser_dismiss"
  | "plan_created"
  | "plan_completed"
  | "export_blocked"

export function track(event: AnalyticsEvent, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return
  try {
    window.gtag?.("event", event, params)
  } catch {
    // Analytics must never be able to break the page it measures.
  }
}
