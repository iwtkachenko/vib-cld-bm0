import { ObjectId, type ClientSession } from 'mongodb'
import {
  daysBetween, endDateFor, newShortId, ranksAfter, renderNamePattern, todayString,
  type CreateProjectInput, type UpdateProjectInput,
} from '@pm/shared'
import type { CardDoc, CardTypeDoc, FlowDoc, ProjectDoc, TemplateDoc, TypeFlowDoc } from '../models'
import { conflict, notFound, unprocessable } from '../errors'
import { assertRefs, oid, oids, pathOid, uniqueOids, type TeamScope } from '../tenancy'
import { withTxn } from '../txn'
import {
  assertMembers, buildCard, fieldValuesOrThrow, linkCardToProject, nextCardNumbers, remapPrimaryCards, setPrimaryProject,
} from './cards'

const hex = (id: ObjectId) => id.toHexString()

export async function loadProject(ts: TeamScope, id: string, session?: ClientSession): Promise<ProjectDoc> {
  const project = await ts.projects.findOne({ _id: pathOid(id, 'Project') }, { session })
  if (!project) throw notFound('Project not found')
  return project
}

export const toTypeFlowDocs = (tfs: { cardTypeId: string; flowId: string }[]): TypeFlowDoc[] =>
  tfs.map((tf) => ({ cardTypeId: oid(tf.cardTypeId), flowId: oid(tf.flowId) }))

/** Card types and flows referenced by a mapping must belong to the team (archived types only if `keepArchived`). */
export async function assertTypeFlows(
  ts: TeamScope, tfs: TypeFlowDoc[], keepArchived: Set<string> = new Set(), session?: ClientSession,
): Promise<void> {
  await assertRefs(ts.flows, tfs.map((t) => t.flowId), 'flow', session)
  const typeIds = uniqueOids(tfs.map((t) => t.cardTypeId))
  const types = await ts.cardTypes.find({ _id: { $in: typeIds } }, { session }).toArray()
  if (types.length !== typeIds.length) throw unprocessable('Unknown card type')
  const archived = types.find((t) => t.archivedAt && !keepArchived.has(hex(t._id)))
  if (archived) throw unprocessable(`Card type "${archived.name}" is archived`)
}

export async function createProject(ts: TeamScope, input: CreateProjectInput) {
  const template = input.templateId ? await ts.templates.findOne({ _id: oid(input.templateId) }) : null
  if (input.templateId && !template) throw unprocessable('Unknown template')
  if (!template && input.blueprintIds?.length) throw unprocessable('blueprintIds require a template')
  const typeFlows = input.typeFlows ? toTypeFlowDocs(input.typeFlows) : (template?.typeFlows ?? [])
  if (typeFlows.length === 0) throw unprocessable('Map at least one card type to a flow')
  const newCardTypeIds = input.newCards.map((n) => oid(n.typeId))
  await assertRefs(ts.cardTypes, newCardTypeIds, 'card type')
  await assertMembers(ts, input.newCards.flatMap((n) => oids(n.assigneeIds)))
  await assertRefs(ts.cards, input.cards.map((c) => oid(c.cardId)), 'card')
  if (new Set(input.cards.map((c) => c.cardId)).size !== input.cards.length) throw unprocessable('Duplicate card in request')

  return withTxn(ts.deps.client, async (session) => {
    await assertTypeFlows(ts, typeFlows, new Set(), session)
    const now = new Date()
    const today = todayString()
    let n = 1
    if (template) {
      const before = await ts.templates.findOneAndUpdate({ _id: template._id }, { $inc: { projectsCreated: 1 } }, { returnDocument: 'before', session })
      n = (before?.projectsCreated ?? 0) + 1
    }
    const startDate = input.startDate ?? (template ? today : null)
    const endDate = input.endDate ?? (template && startDate ? endDateFor(startDate, template.durationDays) : null)
    const name = input.name ?? renderNamePattern(template!.namePattern, { n, date: startDate ?? today })
    const project: Omit<ProjectDoc, 'teamId'> = {
      _id: new ObjectId(), name, description: input.description ?? template?.description ?? '', state: 'active',
      startDate, endDate, typeFlows, templateId: template?._id ?? null, createdBy: ts.user._id, createdAt: now, completedAt: null,
    }
    await ts.projects.insertOne(project, { session })
    const full: ProjectDoc = { ...project, teamId: ts.teamId }

    // Cards created right away: template blueprints + ad-hoc new cards.
    const blueprints = (template?.blueprints ?? []).filter((b) => !input.blueprintIds || input.blueprintIds.includes(b.id))
    const toCreate = [
      ...blueprints.map((b) => ({ typeId: b.typeId, title: b.title, body: b.body, assigneeIds: [] as ObjectId[] })),
      ...input.newCards.map((c) => ({ typeId: oid(c.typeId), title: c.title, body: c.body, assigneeIds: uniqueOids(oids(c.assigneeIds)) })),
    ]
    const created: CardDoc[] = []
    if (toCreate.length) {
      const types = new Map((await ts.cardTypes.find({ _id: { $in: uniqueOids(toCreate.map((c) => c.typeId)) } }, { session }).toArray()).map((t) => [hex(t._id), t] as const))
      const flows = new Map((await ts.flows.find({ _id: { $in: uniqueOids(typeFlows.map((t) => t.flowId)) } }, { session }).toArray()).map((f) => [hex(f._id), f] as const))
      const numbers = await nextCardNumbers(ts, toCreate.length, session)
      const ranks = ranksAfter(null, toCreate.length)
      const docs = toCreate.map((c, i) => {
        const type: CardTypeDoc | undefined = types.get(hex(c.typeId))
        if (!type) throw unprocessable('Unknown card type')
        if (type.archivedAt) throw unprocessable(`Card type "${type.name}" is archived`)
        const mapping = typeFlows.find((tf) => tf.cardTypeId.equals(c.typeId))
        if (!mapping) throw unprocessable(`Card type "${type.name}" is not mapped in this project`)
        const flow: FlowDoc | undefined = flows.get(hex(mapping.flowId))
        if (!flow) throw unprocessable('Unknown flow')
        // Quick-created cards may leave required custom fields empty; they can be filled in later.
        const fields = fieldValuesOrThrow(type, {}, { mode: 'update', existing: {} })
        return buildCard(ts, { number: numbers[i]!, project: full, type, flow, title: c.title, body: c.body, fields, assigneeIds: c.assigneeIds, rank: ranks[i]!, now })
      })
      await ts.cards.insertMany(docs, { session })
      created.push(...docs.map((d) => ({ ...d, teamId: ts.teamId })))
    }

    // Existing cards: link, or move (become primary here, leave their previous primary).
    let linked = 0
    let moved = 0
    for (const { cardId, mode } of input.cards) {
      const card = await ts.cards.findOne({ _id: oid(cardId) }, { session })
      if (!card) throw unprocessable('Unknown card')
      if (mode === 'move') {
        await setPrimaryProject(ts, card, full._id, false, session)
        moved++
      } else {
        await linkCardToProject(ts, card, full._id, session)
        linked++
      }
    }
    return { project: full, created: created.length, linked, moved }
  })
}

export async function updateProject(ts: TeamScope, project: ProjectDoc, input: UpdateProjectInput): Promise<ProjectDoc> {
  if (input.typeFlows && project.state !== 'active') throw unprocessable('Reopen the project to change its card types')
  const startDate = input.startDate !== undefined ? input.startDate : project.startDate
  const endDate = input.endDate !== undefined ? input.endDate : project.endDate
  if (startDate && endDate && endDate < startDate) throw unprocessable('End date is before start date')

  return withTxn(ts.deps.client, async (session) => {
    const set: Record<string, unknown> = {}
    if (input.name !== undefined) set.name = input.name
    if (input.description !== undefined) set.description = input.description
    if (input.startDate !== undefined) set.startDate = input.startDate
    if (input.endDate !== undefined) set.endDate = input.endDate
    if (input.typeFlows) {
      const next = toTypeFlowDocs(input.typeFlows)
      if (next.length === 0) throw unprocessable('Map at least one card type to a flow')
      await assertTypeFlows(ts, next, new Set(project.typeFlows.map((t) => hex(t.cardTypeId))), session)
      for (const old of project.typeFlows) {
        const replacement = next.find((t) => t.cardTypeId.equals(old.cardTypeId))
        const primaryCount = await ts.cards.count({ primaryProjectId: project._id, typeId: old.cardTypeId }, { session })
        if (!replacement) {
          if (primaryCount > 0) {
            const type = await ts.cardTypes.findOne({ _id: old.cardTypeId }, { session })
            throw conflict(`Cannot unmap "${type?.name}": ${primaryCount} card(s) of this type have this project as primary`)
          }
        } else if (!replacement.flowId.equals(old.flowId) && primaryCount > 0) {
          await remapPrimaryCards(ts, project, old.cardTypeId, replacement.flowId, session)
        }
      }
      set.typeFlows = next
    }
    if (Object.keys(set).length === 0) return project
    return (await ts.projects.findOneAndUpdate({ _id: project._id }, { $set: set }, { returnDocument: 'after', session }))!
  })
}

export async function completeProject(ts: TeamScope, project: ProjectDoc, carryOverToProjectId?: string) {
  if (project.state !== 'active') throw conflict('The project is already archived')
  const target = carryOverToProjectId ? await ts.projects.findOne({ _id: oid(carryOverToProjectId) }) : null
  if (carryOverToProjectId) {
    if (!target) throw unprocessable('Unknown project')
    if (target._id.equals(project._id)) throw unprocessable('Cannot carry cards over to the same project')
    if (target.state !== 'active') throw unprocessable('The carry-over project is archived')
  }
  return withTxn(ts.deps.client, async (session) => {
    let carriedOver = 0
    if (target) {
      const open = await ts.cards.find({ primaryProjectId: project._id, statusCategory: { $ne: 'done' } }, { session, sort: { number: 1 } }).toArray()
      const unmapped = uniqueOids(open.map((c) => c.typeId).filter((t) => !target.typeFlows.some((tf) => tf.cardTypeId.equals(t))))
      if (unmapped.length) {
        const types = await ts.cardTypes.find({ _id: { $in: unmapped } }, { session }).toArray()
        throw unprocessable(`"${target.name}" does not map card types: ${types.map((t) => t.name).join(', ')}`, { typeIds: unmapped.map(hex) })
      }
      for (const card of open) {
        await setPrimaryProject(ts, card, target._id, true, session)
        carriedOver++
      }
    }
    const project2 = await ts.projects.findOneAndUpdate(
      { _id: project._id }, { $set: { state: 'archived', completedAt: new Date() } }, { returnDocument: 'after', session },
    )
    return { project: project2!, carriedOver }
  })
}

export async function reopenProject(ts: TeamScope, project: ProjectDoc): Promise<ProjectDoc> {
  if (project.state !== 'archived') throw conflict('The project is not archived')
  return (await ts.projects.findOneAndUpdate({ _id: project._id }, { $set: { state: 'active', completedAt: null } }, { returnDocument: 'after' }))!
}

export async function deleteProject(ts: TeamScope, project: ProjectDoc): Promise<void> {
  await withTxn(ts.deps.client, async (session) => {
    const primary = await ts.cards.count({ primaryProjectId: project._id }, { session })
    if (primary > 0) throw conflict(`${primary} card(s) have this project as primary. Move or delete them first, or archive the project instead.`)
    await ts.cards.updateMany(
      { projectIds: project._id },
      { $pull: { projectIds: project._id }, $unset: { [`placements.${hex(project._id)}`]: '' } },
      { session },
    )
    await ts.projects.deleteOne({ _id: project._id }, { session })
  })
}

export async function saveProjectAsTemplate(
  ts: TeamScope, project: ProjectDoc, input: { name: string; namePattern?: string; durationDays?: number | null; includeCards: boolean },
): Promise<TemplateDoc> {
  const derivedDuration = project.startDate && project.endDate ? daysBetween(project.startDate, project.endDate) + 1 : null
  const blueprints = input.includeCards
    ? (await ts.cards.find({ primaryProjectId: project._id }, { sort: { number: 1 }, limit: 100 }).toArray()).map((c) => ({
        id: newShortId(), typeId: c.typeId, title: c.title, body: c.body,
      }))
    : []
  const doc: Omit<TemplateDoc, 'teamId'> = {
    _id: new ObjectId(),
    name: input.name,
    description: project.description,
    namePattern: input.namePattern ?? project.name,
    durationDays: input.durationDays !== undefined ? input.durationDays : derivedDuration,
    typeFlows: project.typeFlows,
    blueprints,
    projectsCreated: 0,
    createdAt: new Date(),
  }
  await ts.templates.insertOne(doc)
  return { ...doc, teamId: ts.teamId }
}

/** total / done card counts per project (cards linked, any role). */
export async function projectCounts(ts: TeamScope, projectIds: ObjectId[]): Promise<Map<string, { total: number; done: number }>> {
  const out = new Map<string, { total: number; done: number }>()
  if (projectIds.length === 0) return out
  const rows = await ts.cards.aggregate<{ _id: ObjectId; total: number; done: number }>([
    { $match: { projectIds: { $in: projectIds } } },
    { $unwind: '$projectIds' },
    { $match: { projectIds: { $in: projectIds } } },
    { $group: { _id: '$projectIds', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$statusCategory', 'done'] }, 1, 0] } } } },
  ]).toArray()
  for (const r of rows) out.set(hex(r._id), { total: r.total, done: r.done })
  return out
}
