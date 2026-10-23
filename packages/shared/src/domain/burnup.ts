import { addDays, dayInZone, daysBetween } from './template'

export interface BurnupPoint {
  date: string
  scope: number
  done: number
}

/**
 * Daily cumulative scope (cards added) and done (cards completed) from `from` to `to` inclusive.
 * Items added/completed before `from` count from the first day. Capped at 366 days (the most recent).
 */
export function buildBurnup(
  items: { addedAt: string; completedAt: string | null }[],
  from: string,
  to: string,
  timeZone = 'UTC',
): BurnupPoint[] {
  if (to < from) return []
  if (daysBetween(from, to) > 365) from = addDays(to, -365)
  const added = new Map<string, number>()
  const completed = new Map<string, number>()
  let scope = 0
  let done = 0
  for (const it of items) {
    const a = dayInZone(new Date(it.addedAt), timeZone)
    if (a <= from) scope++
    else added.set(a, (added.get(a) ?? 0) + 1)
    if (it.completedAt) {
      const c = dayInZone(new Date(it.completedAt), timeZone)
      if (c <= from) done++
      else completed.set(c, (completed.get(c) ?? 0) + 1)
    }
  }
  const out: BurnupPoint[] = [{ date: from, scope, done }]
  for (let day = addDays(from, 1); day <= to; day = addDays(day, 1)) {
    scope += added.get(day) ?? 0
    done += completed.get(day) ?? 0
    out.push({ date: day, scope, done })
  }
  return out
}
