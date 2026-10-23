import type { Filter } from 'mongodb'
import type { ProjectStatsDto, StatusCategory } from '@pm/shared'
import type { CardDoc, ProjectDoc } from '../models'
import type { TeamScope } from '../tenancy'

const hex = (id: { toHexString(): string }) => id.toHexString()

/**
 * Statistics for a project. Computed "as of" the project's completion (or now), so closing a sprint
 * freezes its numbers even when carried-over cards are finished elsewhere later.
 * Status distribution always shows the cards' current statuses.
 */
export async function projectStats(ts: TeamScope, project: ProjectDoc): Promise<ProjectStatsDto> {
  const asOf = project.completedAt ?? new Date()
  const pid = hex(project._id)
  const all = await ts.cards.find({ projectIds: project._id } as Filter<CardDoc>).toArray()
  const addedAtOf = (c: CardDoc) => c.placements[pid]?.addedAt ?? c.createdAt
  const cards = all.filter((c) => addedAtOf(c) <= asOf)
  const isDone = (c: CardDoc) => c.completedAt !== null && c.completedAt <= asOf
  const categoryOf = (c: CardDoc): StatusCategory => {
    if (isDone(c)) return 'done'
    return c.statusCategory === 'done' ? 'in_progress' : c.statusCategory
  }

  let todo = 0
  let inProgress = 0
  let done = 0
  for (const c of cards) {
    const cat = categoryOf(c)
    if (cat === 'done') done++
    else if (cat === 'in_progress') inProgress++
    else todo++
  }

  const flowIds = [...new Map(cards.map((c) => [hex(c.flowId), c.flowId])).values()]
  const flows = await ts.flows.find({ _id: { $in: flowIds } }).toArray()
  const counts = new Map<string, number>()
  for (const c of cards) counts.set(`${hex(c.flowId)}:${c.statusId}`, (counts.get(`${hex(c.flowId)}:${c.statusId}`) ?? 0) + 1)
  const byStatus = flows.map((f) => ({
    flowId: hex(f._id),
    flowName: f.name,
    statuses: f.statuses.map((s) => ({ statusId: s.id, name: s.name, category: s.category, color: s.color, count: counts.get(`${hex(f._id)}:${s.id}`) ?? 0 })),
  }))

  const typeIds = [...new Map(cards.map((c) => [hex(c.typeId), c.typeId])).values()]
  const types = await ts.cardTypes.find({ _id: { $in: typeIds } }).toArray()
  const byType = types
    .map((t) => {
      const mine = cards.filter((c) => c.typeId.equals(t._id))
      return { typeId: hex(t._id), name: t.name, color: t.color, total: mine.length, done: mine.filter(isDone).length }
    })
    .sort((a, b) => b.total - a.total)

  const assigneeIds = [...new Map(cards.flatMap((c) => c.assigneeIds).map((a) => [hex(a), a])).values()]
  const users = await ts.deps.c.users.find({ _id: { $in: assigneeIds } }, { projection: { name: 1 } }).toArray()
  const byAssignee = users
    .map((u) => {
      const mine = cards.filter((c) => c.assigneeIds.some((a) => a.equals(u._id)))
      return { userId: hex(u._id) as string | null, name: u.name, total: mine.length, done: mine.filter(isDone).length }
    })
  const unassigned = cards.filter((c) => c.assigneeIds.length === 0)
  if (unassigned.length) byAssignee.push({ userId: null, name: 'Unassigned', total: unassigned.length, done: unassigned.filter(isDone).length })
  byAssignee.sort((a, b) => b.total - a.total)

  return {
    asOf: asOf.toISOString(),
    total: cards.length,
    todo,
    inProgress,
    done,
    completionPct: cards.length ? Math.round((done / cards.length) * 100) : 0,
    byStatus,
    byType,
    byAssignee,
    timeline: cards.map((c) => ({ addedAt: addedAtOf(c).toISOString(), completedAt: isDone(c) ? c.completedAt!.toISOString() : null })),
  }
}
