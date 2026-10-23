/** Derive a short uppercase team key (e.g. "Acme Corp" -> "AC", "Platform" -> "PLAT"). */
export function deriveTeamKey(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  let key = ''
  if (words.length > 1) key = words.slice(0, 4).map((w) => w[0]).join('')
  else if (words.length === 1) key = words[0]!.slice(0, 4)
  key = key.toUpperCase()
  if (!/^[A-Z]/.test(key)) key = `T${key}`
  if (key.length < 2) key = `${key}X`
  return key.slice(0, 10)
}

export function cardKey(teamKey: string, number: number): string {
  return `${teamKey}-${number}`
}
