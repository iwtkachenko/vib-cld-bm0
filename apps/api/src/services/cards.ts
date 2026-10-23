import { ObjectId, type ClientSession, type Filter } from 'mongodb'
import {
  canTransition, isValidRank, rankAfter, remapStatus, validateFieldValues,
  type CreateCardInput, type FieldValues, type FlowShape, type StatusDef, type UpdateCardInput,
} from '@pm/shared'
import type { CardDoc, CardTypeDoc, FlowDoc, ProjectDoc } from '../models'
import { conflict, isDuplicateKey, notFound, unprocessable } from '../errors'
import { oid, oids, pathOid, uniqueOids, type TeamScope } from '../tenancy'

const hex = (id: ObjectId) => id.toHexString()

/** Allocate `count` consecutive card numbers for the team. */
export async function nextCardNumbers(ts: TeamScope, count: number, session?: ClientSession): Promise<number[]> {
  if (count === 0) return []
  for (let attempt = 0; ; attempt++) {
    try {
      const doc = await ts.deps.c.counters.findOneAndUpdate(
        { _id: `card:${hex(ts.teamId)}` },
        { $inc: { seq: count } },
        { upsert: true, returnDocument: 'after', session },
      )
      const end = doc!.seq
      return Array.from({ length: count }, (_, i) => end - count + 1 + i)
    } catch (e) {
      if (isDuplicateKey(e) && attempt < 2) continue
      throw e
    }
  }
}

/** Highest rank currently used in a project's ordering, or null for an empty project. */
export async function lastRank(ts: TeamScope, projectId: ObjectId, session?: ClientSession): Promise<string | null> {
  const key = `placements.${hex(projectId)}.rank`
  const [last] = await ts.cards
    .find({ projectIds: projectId, [key]: { $exists: true } } as Filter<CardDoc>, {
      projection: { [key]: 1 }, sort: { [key]: -1 }, limit: 1, session,
    })
    .toArray()
  return last?.placements?.[hex(projectId)]?.rank ?? null
}

export async function assertMembers(ts: TeamScope, userIds: ObjectId[], session?: ClientSession): Promise<void> {
  const unique = uniqueOids(userIds)
  if (unique.length === 0) return
  const n = await ts.memberships.count({ userId: { $in: unique } }, { session })
  if (n !== unique.length) throw unprocessable('Assignees must be members of the team')
}

export async function loadCard(ts: TeamScope, id: string, session?: ClientSession): Promise<CardDoc> {
  const card = await ts.cards.findOne({ _id: pathOid(id, 'Card') }, { session })
  if (!card) throw notFound('Card not found')
  return card
}

/** Project + card type + flow needed to create a card of `typeId` in `project`. */
export async function resolveCardContext(
  ts: TeamScope, project: ProjectDoc, typeId: ObjectId, session?: ClientSession,
): Promise<{ type: CardTypeDoc; flow: FlowDoc }> {
  if (project.state !== 'active') throw unprocessable('Project is archived')
  const type = await ts.cardTypes.findOne({ _id: typeId }, { session })
  if (!type) throw unprocessable('Unknown card type')
  if (type.archivedAt) throw unprocessable(`Card type "${type.name}" is archived`)
  const mapping = project.typeFlows.find((tf) => tf.cardTypeId.equals(typeId))
  if (!mapping) throw unprocessable(`Card type "${type.name}" is not mapped in project "${project.name}"`)
  const flow = await ts.flows.findOne({ _id: mapping.flowId }, { session })
  if (!flow) throw unprocessable('The flow mapped to this card type no longer exists')
  return { type, flow }
}

export function fieldValuesOrThrow(
  type: CardTypeDoc | null, input: Record<string, unknown>, mode: { mode: 'create' } | { mode: 'update'; existing: FieldValues },
): FieldValues {
  const r = validateFieldValues(type?.fields ?? [], input, mode)
  if (!r.ok) throw unprocessable('Invalid custom fields', { fields: r.errors })
  return r.values
}

export function buildCard(
  ts: TeamScope,
  a: {
    number: number; project: ProjectDoc; type: CardTypeDoc; flow: FlowDoc; title: string; body: string
    fields: FieldValues; assigneeIds: ObjectId[]; rank: string; now: Date
  },
): Omit<CardDoc, 'teamId'> {
  const status = a.flow.statuses.find((s) => s.id === a.flow.initialStatusId)!
  return {
    _id: new ObjectId(),
    number: a.number,
    typeId: a.type._id,
    flowId: a.flow._id,
    statusId: status.id,
    statusCategory: status.category,
    title: a.title,
    body: a.body,
    fields: a.fields,
    assigneeIds: a.assigneeIds,
    primaryProjectId: a.project._id,
    projectIds: [a.project._id],
    placements: { [hex(a.project._id)]: { rank: a.rank, addedAt: a.now } },
    createdBy: ts.user._id,
    createdAt: a.now,
    updatedAt: a.now,
    statusChangedAt: a.now,
    completedAt: status.category === 'done' ? a.now : null,
  }
}

export async function createCard(ts: TeamScope, input: CreateCardInput): Promise<CardDoc> {
  const project = await ts.projects.findOne({ _id: oid(input.projectId) })
  if (!project) throw unprocessable('Unknown project')
  const assigneeIds = uniqueOids(oids(input.assigneeIds))
  await assertMembers(ts, assigneeIds)
  const { type, flow } = await resolveCardContext(ts, project, oid(input.typeId))
  const fields = fieldValuesOrThrow(type, input.fields, { mode: 'create' })
  const [number] = await nextCardNumbers(ts, 1)
  const rank = rankAfter(await lastRank(ts, project._id))
  const doc = buildCard(ts, { number: number!, project, type, flow, title: input.title, body: input.body, fields, assigneeIds, rank, now: new Date() })
  await ts.cards.insertOne(doc)
  return { ...doc, teamId: ts.teamId }
}

export async function updateCard(ts: TeamScope, card: CardDoc, input: UpdateCardInput): Promise<CardDoc> {
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (input.title !== undefined) set.title = input.title
  if (input.body !== undefined) set.body = input.body
  if (input.assigneeIds !== undefined) {
    const ids = uniqueOids(oids(input.assigneeIds))
    await assertMembers(ts, ids)
    set.assigneeIds = ids
  }
  if (input.fields !== undefined) {
    const type = await ts.cardTypes.findOne({ _id: card.typeId })
    set.fields = fieldValuesOrThrow(type, input.fields, { mode: 'update', existing: card.fields })
  }
  return (await ts.cards.findOneAndUpdate({ _id: card._id }, { $set: set }, { returnDocument: 'after' })) ?? card
}

function flowChangeFields(card: CardDoc, newFlow: FlowDoc, status: StatusDef, now: Date) {
  return {
    flowId: newFlow._id,
    statusId: status.id,
    statusCategory: status.category,
    statusChangedAt: now,
    completedAt: status.category === 'done' ? (card.completedAt ?? now) : null,
  }
}

/** Move all primary cards of `typeId` of a project from one flow to another (statuses remapped). */
export async function remapPrimaryCards(
  ts: TeamScope, project: ProjectDoc, typeId: ObjectId, newFlowId: ObjectId, session?: ClientSession,
): Promise<void> {
  const newFlow = await ts.flows.findOne({ _id: newFlowId }, { session })
  if (!newFlow) throw unprocessable('Unknown flow')
  const cards = await ts.cards.find({ primaryProjectId: project._id, typeId }, { session }).toArray()
  const flowCache = new Map<string, FlowDoc | null>()
  const now = new Date()
  for (const card of cards) {
    if (card.flowId.equals(newFlowId)) continue
    if (!flowCache.has(hex(card.flowId))) flowCache.set(hex(card.flowId), await ts.flows.findOne({ _id: card.flowId }, { session }))
    const oldFlow: Pick<FlowShape, 'statuses'> = flowCache.get(hex(card.flowId)) ?? { statuses: [] }
    const status = remapStatus(oldFlow, card.statusId, newFlow)
    await ts.cards.updateOne({ _id: card._id }, { $set: { ...flowChangeFields(card, newFlow, status, now), updatedAt: now } }, { session })
  }
}

export async function transitionCard(
  ts: TeamScope,
  card: CardDoc,
  input: { expectedStatusId: string; toStatusId: string; projectId?: string; rank?: string },
): Promise<CardDoc> {
  if (card.statusId !== input.expectedStatusId) throw conflict('The card was moved by someone else', { currentStatusId: card.statusId })
  const flow = await ts.flows.findOne({ _id: card.flowId })
  if (!flow) throw unprocessable('The flow of this card no longer exists')
  const to = flow.statuses.find((s) => s.id === input.toStatusId)
  if (!to) throw unprocessable('Unknown status')
  const changed = to.id !== card.statusId
  if (changed && !canTransition(flow, card.statusId, to.id)) {
    throw unprocessable(`Transition from "${flow.statuses.find((s) => s.id === card.statusId)?.name}" to "${to.name}" is not allowed`)
  }
  const now = new Date()
  const set: Record<string, unknown> = { updatedAt: now }
  if (changed) {
    set.statusId = to.id
    set.statusCategory = to.category
    set.statusChangedAt = now
    set.completedAt = to.category === 'done' ? (card.completedAt ?? now) : null
  }
  if (input.rank !== undefined) {
    const pid = input.projectId
    if (!pid || !card.projectIds.some((p) => hex(p) === pid)) throw unprocessable('rank requires a project the card is linked to')
    if (!isValidRank(input.rank)) throw unprocessable('Invalid rank')
    set[`placements.${pid}.rank`] = input.rank
  }
  if (!changed && input.rank === undefined) return card
  const updated = await ts.cards.findOneAndUpdate(
    { _id: card._id, statusId: input.expectedStatusId }, { $set: set }, { returnDocument: 'after' },
  )
  if (!updated) throw conflict('The card was moved by someone else')
  return updated
}

/**
 * Make `projectId` the card's primary project. The card's flow follows the new primary's mapping
 * (status remapped); the previous primary stays linked unless `keepPreviousLink` is false.
 */
export async function setPrimaryProject(
  ts: TeamScope, card: CardDoc, projectId: ObjectId, keepPreviousLink: boolean, session?: ClientSession,
): Promise<CardDoc> {
  if (card.primaryProjectId.equals(projectId)) return card
  const target = await ts.projects.findOne({ _id: projectId }, { session })
  if (!target) throw unprocessable('Unknown project')
  if (target.state !== 'active') throw unprocessable('Project is archived')
  const mapping = target.typeFlows.find((tf) => tf.cardTypeId.equals(card.typeId))
  if (!mapping) {
    const type = await ts.cardTypes.findOne({ _id: card.typeId }, { session })
    throw unprocessable(`Card type "${type?.name ?? '?'}" is not mapped in project "${target.name}"`, { typeIds: [hex(card.typeId)] })
  }
  const now = new Date()
  const set: Record<string, unknown> = { primaryProjectId: target._id, updatedAt: now }
  if (!mapping.flowId.equals(card.flowId)) {
    const [oldFlow, newFlow] = await Promise.all([
      ts.flows.findOne({ _id: card.flowId }, { session }),
      ts.flows.findOne({ _id: mapping.flowId }, { session }),
    ])
    if (!newFlow) throw unprocessable('The flow mapped in the target project no longer exists')
    Object.assign(set, flowChangeFields(card, newFlow, remapStatus(oldFlow ?? { statuses: [] }, card.statusId, newFlow), now))
  }
  let projectIds = card.projectIds
  const placements = { ...card.placements }
  if (!projectIds.some((p) => p.equals(target._id))) {
    projectIds = [...projectIds, target._id]
    placements[hex(target._id)] = { rank: rankAfter(await lastRank(ts, target._id, session)), addedAt: now }
  }
  if (!keepPreviousLink) {
    projectIds = projectIds.filter((p) => !p.equals(card.primaryProjectId))
    delete placements[hex(card.primaryProjectId)]
  }
  set.projectIds = projectIds
  set.placements = placements
  return (await ts.cards.findOneAndUpdate({ _id: card._id }, { $set: set }, { returnDocument: 'after', session }))!
}

export async function linkCardToProject(ts: TeamScope, card: CardDoc, projectId: ObjectId, session?: ClientSession): Promise<CardDoc> {
  const project = await ts.projects.findOne({ _id: projectId }, { session })
  if (!project) throw unprocessable('Unknown project')
  if (project.state !== 'active') throw unprocessable('Project is archived')
  if (card.projectIds.some((p) => p.equals(projectId))) return card
  const now = new Date()
  const rank = rankAfter(await lastRank(ts, projectId, session))
  return (await ts.cards.findOneAndUpdate(
    { _id: card._id },
    { $addToSet: { projectIds: projectId }, $set: { [`placements.${hex(projectId)}`]: { rank, addedAt: now }, updatedAt: now } },
    { returnDocument: 'after', session },
  ))!
}

export async function unlinkCardFromProject(ts: TeamScope, card: CardDoc, projectId: ObjectId): Promise<CardDoc> {
  if (card.primaryProjectId.equals(projectId)) throw unprocessable('Cannot unlink the primary project; make another project primary first')
  if (!card.projectIds.some((p) => p.equals(projectId))) throw notFound('The card is not linked to this project')
  return (await ts.cards.findOneAndUpdate(
    { _id: card._id },
    { $pull: { projectIds: projectId }, $unset: { [`placements.${hex(projectId)}`]: '' }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' },
  ))!
}
