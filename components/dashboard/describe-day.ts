/**
 * "Today", "3 days ago", or a date — whichever reads best for how long ago.
 *
 * Runs in the reader's time zone, which the server does not know, so callers
 * render the result with `suppressHydrationWarning`: the first paint may be a
 * day off near midnight, and the browser corrects it as it hydrates.
 */
export function describeDay(iso: string, language: string, now: number = Date.now()): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return ""

  const midnight = (moment: number) => {
    const day = new Date(moment)
    day.setHours(0, 0, 0, 0)
    return day.getTime()
  }
  // Rounded, not floored: a day that contains a clock change is 23 or 25 hours.
  const days = Math.round((midnight(now) - midnight(time)) / 86_400_000)

  if (days >= 0 && days < 7) {
    return new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(-days, "day")
  }
  return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(time)
}
