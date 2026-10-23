import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

/** Rank strictly between two neighbours (null = open end). Throws on invalid keys or a >= b. */
export function rankBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after)
}

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/**
 * Rank that sorts after `last` (null = empty list), with random jitter so that concurrent appends
 * never produce identical ranks (identical neighbours would make `rankBetween` throw later).
 * Keys must not end in '0', and appending digits to a valid key keeps it valid.
 */
export function rankAfter(last: string | null): string {
  let jitter = ''
  for (let i = 0; i < 4; i++) jitter += DIGITS[Math.floor(Math.random() * DIGITS.length)]
  if (jitter.endsWith('0')) jitter = `${jitter.slice(0, -1)}V`
  return generateKeyBetween(last, null) + jitter
}

/** `n` increasing ranks that all sort after `last` (null = start of the list). */
export function ranksAfter(last: string | null, n: number): string[] {
  return n > 0 ? generateNKeysBetween(last, null, n) : []
}

export function isValidRank(rank: string): boolean {
  try {
    generateKeyBetween(rank, null)
    return true
  } catch {
    return false
  }
}

/** Plain code-unit comparison, as required by fractional-indexing (never localeCompare). */
export function compareRank(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Sort cards for one project's board: by rank, ties broken by card number. */
export function sortByRank<T extends { number: number; ranks: Record<string, string> }>(cards: T[], projectId: string): T[] {
  return [...cards].sort((a, b) => {
    const ra = a.ranks[projectId]
    const rb = b.ranks[projectId]
    if (ra !== undefined && rb !== undefined) {
      const c = compareRank(ra, rb)
      if (c !== 0) return c
    } else if (ra !== undefined) return -1
    else if (rb !== undefined) return 1
    return a.number - b.number
  })
}
