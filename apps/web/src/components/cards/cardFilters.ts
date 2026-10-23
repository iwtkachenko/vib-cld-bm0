import type { CardDto } from '@pm/shared'

/** Client-side search on key (ACME-12, 12) and title. */
export function matchesSearch(card: Pick<CardDto, 'key' | 'title' | 'number'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return card.key.toLowerCase().includes(q) || card.title.toLowerCase().includes(q) || String(card.number) === q
}
