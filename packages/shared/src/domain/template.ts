/** YYYY-MM-DD for "today" in the given time zone (UTC by default). */
export function todayString(timeZone = 'UTC', now = new Date()): string {
  return dayInZone(now, timeZone)
}

export function dayInZone(date: Date, timeZone = 'UTC'): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  const f = Date.parse(`${from}T00:00:00Z`)
  const t = Date.parse(`${to}T00:00:00Z`)
  return Math.round((t - f) / 86400000)
}

/** Replace `{n}` (sequence number) and `{date}` (start date) in a project name pattern. */
export function renderNamePattern(pattern: string, vars: { n: number; date: string }): string {
  return pattern.replaceAll('{n}', String(vars.n)).replaceAll('{date}', vars.date).trim()
}

/** End date for a template with a duration: start + duration - 1 days (a 14-day sprint ends on day 14). */
export function endDateFor(startDate: string, durationDays: number | null): string | null {
  return durationDays ? addDays(startDate, durationDays - 1) : null
}
