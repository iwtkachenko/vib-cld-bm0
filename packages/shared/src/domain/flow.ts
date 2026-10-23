import type { FlowShape, StatusDef, Transition } from '../types'

/** Returns a list of human-readable problems; empty when the flow is valid. */
export function validateFlowDef(flow: FlowShape): string[] {
  const issues: string[] = []
  const { statuses, initialStatusId, transitions } = flow
  if (statuses.length < 1) issues.push('A flow needs at least one status')
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const s of statuses) {
    if (ids.has(s.id)) issues.push(`Duplicate status id "${s.id}"`)
    const n = s.name.trim().toLowerCase()
    if (names.has(n)) issues.push(`Duplicate status name "${s.name}"`)
    ids.add(s.id)
    names.add(n)
  }
  if (!statuses.some((s) => s.category === 'done')) issues.push('A flow needs at least one status in the "done" category')
  if (!ids.has(initialStatusId)) issues.push('Initial status must be one of the flow statuses')
  const seen = new Set<string>()
  for (const t of transitions) {
    if (!ids.has(t.from) || !ids.has(t.to)) {
      issues.push('Transitions must reference existing statuses')
      continue
    }
    if (t.from === t.to) issues.push('A status cannot transition to itself')
    const k = `${t.from}>${t.to}`
    if (seen.has(k)) issues.push('Duplicate transition')
    seen.add(k)
  }
  return issues
}

/** Every status can move to every other status. */
export function allTransitions(statuses: StatusDef[]): Transition[] {
  const out: Transition[] = []
  for (const a of statuses) for (const b of statuses) if (a.id !== b.id) out.push({ from: a.id, to: b.id })
  return out
}

/** Statuses can move to their neighbours only (previous / next). */
export function linearTransitions(statuses: StatusDef[]): Transition[] {
  const out: Transition[] = []
  statuses.forEach((s, i) => {
    const next = statuses[i + 1]
    if (next) {
      out.push({ from: s.id, to: next.id })
      out.push({ from: next.id, to: s.id })
    }
  })
  return out
}

export function allowedTargets(flow: Pick<FlowShape, 'transitions'>, fromStatusId: string): string[] {
  return flow.transitions.filter((t) => t.from === fromStatusId).map((t) => t.to)
}

export function canTransition(flow: Pick<FlowShape, 'transitions'>, from: string, to: string): boolean {
  return from !== to && flow.transitions.some((t) => t.from === from && t.to === to)
}

/**
 * Pick the status a card should land in when it moves between flows:
 * same status id, else the first status of the same category, else the target's initial status.
 */
export function remapStatus(
  fromFlow: Pick<FlowShape, 'statuses'>,
  fromStatusId: string,
  toFlow: Pick<FlowShape, 'statuses' | 'initialStatusId'>,
): StatusDef {
  const sameId = toFlow.statuses.find((s) => s.id === fromStatusId)
  if (sameId) return sameId
  const category = fromFlow.statuses.find((s) => s.id === fromStatusId)?.category
  const sameCategory = category ? toFlow.statuses.find((s) => s.category === category) : undefined
  if (sameCategory) return sameCategory
  return toFlow.statuses.find((s) => s.id === toFlow.initialStatusId) ?? toFlow.statuses[0]!
}
