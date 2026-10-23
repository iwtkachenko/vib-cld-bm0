import { z } from 'zod'
import type { Filter } from 'mongodb'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { createCardInput, linkInput, listCardsQuery, setPrimaryInput, transitionInput, updateCardInput } from '@pm/shared'
import type { CardDoc } from '../models'
import { cardDto } from '../serialize'
import {
  createCard, linkCardToProject, loadCard, setPrimaryProject, transitionCard, unlinkCardFromProject, updateCard,
} from '../services/cards'
import { oid, pathOid } from '../tenancy'
import { tscope } from './guard'

const idParams = z.object({ id: z.string() })
const linkParams = z.object({ id: z.string(), projectId: z.string() })
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const cardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/cards', { schema: { querystring: listCardsQuery } }, async (req) => {
    const ts = tscope(req)
    const q = req.query
    const filter: Filter<CardDoc> = {}
    if (q.projectId) filter.projectIds = oid(q.projectId)
    if (q.assigneeId) filter.assigneeIds = oid(q.assigneeId)
    if (q.typeId) filter.typeId = oid(q.typeId)
    if (q.statusCategory) filter.statusCategory = q.statusCategory
    if (q.q) {
      const keyMatch = /^([A-Za-z0-9]+)-(\d+)$/.exec(q.q)
      const ors: Filter<CardDoc>[] = [{ title: { $regex: escapeRegex(q.q), $options: 'i' } }]
      if (keyMatch && keyMatch[1]!.toUpperCase() === ts.team.key) ors.push({ number: Number(keyMatch[2]) })
      else if (/^\d+$/.test(q.q)) ors.push({ number: Number(q.q) })
      filter.$or = ors
    }
    const cards = await ts.cards.find(filter, { sort: { number: 1 }, limit: q.limit, projection: { body: 0 } }).toArray()
    return cards.map((c) => cardDto(c, ts.team.key, false))
  })

  app.post('/cards', { schema: { body: createCardInput } }, async (req, reply) => {
    const ts = tscope(req)
    return reply.status(201).send(cardDto(await createCard(ts, req.body), ts.team.key))
  })

  app.get('/cards/:id', { schema: { params: idParams } }, async (req) => {
    const ts = tscope(req)
    return cardDto(await loadCard(ts, req.params.id), ts.team.key)
  })

  app.patch('/cards/:id', { schema: { params: idParams, body: updateCardInput } }, async (req) => {
    const ts = tscope(req)
    return cardDto(await updateCard(ts, await loadCard(ts, req.params.id), req.body), ts.team.key)
  })

  app.delete('/cards/:id', { schema: { params: idParams } }, async (req) => {
    const ts = tscope(req)
    const card = await loadCard(ts, req.params.id)
    await ts.cards.deleteOne({ _id: card._id })
    return { ok: true }
  })

  app.post('/cards/:id/transition', { schema: { params: idParams, body: transitionInput } }, async (req) => {
    const ts = tscope(req)
    return cardDto(await transitionCard(ts, await loadCard(ts, req.params.id), req.body), ts.team.key)
  })

  app.post('/cards/:id/primary', { schema: { params: idParams, body: setPrimaryInput } }, async (req) => {
    const ts = tscope(req)
    const card = await loadCard(ts, req.params.id)
    return cardDto(await setPrimaryProject(ts, card, oid(req.body.projectId), req.body.keepPreviousLink), ts.team.key)
  })

  app.post('/cards/:id/links', { schema: { params: idParams, body: linkInput } }, async (req) => {
    const ts = tscope(req)
    const card = await loadCard(ts, req.params.id)
    return cardDto(await linkCardToProject(ts, card, oid(req.body.projectId)), ts.team.key)
  })

  app.delete('/cards/:id/links/:projectId', { schema: { params: linkParams } }, async (req) => {
    const ts = tscope(req)
    const card = await loadCard(ts, req.params.id)
    return cardDto(await unlinkCardFromProject(ts, card, pathOid(req.params.projectId, 'Project')), ts.team.key)
  })
}
