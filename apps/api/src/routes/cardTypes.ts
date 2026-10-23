import { ObjectId } from 'mongodb'
import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { cardTypeInput } from '@pm/shared'
import { conflict, notFound, unprocessable } from '../errors'
import type { CardTypeDoc } from '../models'
import { cardTypeDto } from '../serialize'
import { pathOid, type TeamScope } from '../tenancy'
import { tscope } from './guard'

const idParams = z.object({ id: z.string() })

async function load(ts: TeamScope, id: string): Promise<CardTypeDoc> {
  const t = await ts.cardTypes.findOne({ _id: pathOid(id, 'Card type') })
  if (!t) throw notFound('Card type not found')
  return t
}

export const cardTypeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/card-types', async (req) => {
    const ts = tscope(req)
    return (await ts.cardTypes.find({}, { sort: { name: 1 } }).toArray()).map(cardTypeDto)
  })

  app.post('/card-types', { schema: { body: cardTypeInput } }, async (req, reply) => {
    const ts = tscope(req)
    const doc: Omit<CardTypeDoc, 'teamId'> = { _id: new ObjectId(), ...req.body, archivedAt: null, createdAt: new Date() }
    await ts.cardTypes.insertOne(doc)
    return reply.status(201).send(cardTypeDto({ ...doc, teamId: ts.teamId }))
  })

  app.get('/card-types/:id', { schema: { params: idParams } }, async (req) => cardTypeDto(await load(tscope(req), req.params.id)))

  app.patch('/card-types/:id', { schema: { params: idParams, body: cardTypeInput } }, async (req) => {
    const ts = tscope(req)
    const existing = await load(ts, req.params.id)
    for (const f of req.body.fields) {
      const old = existing.fields.find((o) => o.id === f.id)
      if (old && old.kind !== f.kind) throw unprocessable(`The kind of field "${old.name}" cannot be changed`)
    }
    const updated = await ts.cardTypes.findOneAndUpdate({ _id: existing._id }, { $set: req.body }, { returnDocument: 'after' })
    return cardTypeDto(updated!)
  })

  app.post('/card-types/:id/archive', { schema: { params: idParams } }, async (req) => {
    const ts = tscope(req)
    const t = await load(ts, req.params.id)
    return cardTypeDto((await ts.cardTypes.findOneAndUpdate({ _id: t._id }, { $set: { archivedAt: new Date() } }, { returnDocument: 'after' }))!)
  })

  app.post('/card-types/:id/unarchive', { schema: { params: idParams } }, async (req) => {
    const ts = tscope(req)
    const t = await load(ts, req.params.id)
    return cardTypeDto((await ts.cardTypes.findOneAndUpdate({ _id: t._id }, { $set: { archivedAt: null } }, { returnDocument: 'after' }))!)
  })

  app.delete('/card-types/:id', { schema: { params: idParams } }, async (req) => {
    const ts = tscope(req)
    const t = await load(ts, req.params.id)
    const [cards, projects, templates] = await Promise.all([
      ts.cards.count({ typeId: t._id }),
      ts.projects.count({ 'typeFlows.cardTypeId': t._id }),
      ts.templates.count({ 'typeFlows.cardTypeId': t._id }),
    ])
    if (cards + projects + templates > 0) {
      throw conflict(`Card type is in use (${cards} cards, ${projects} projects, ${templates} templates). Archive it instead.`, { cards, projects, templates })
    }
    await ts.cardTypes.deleteOne({ _id: t._id })
    return { ok: true }
  })
}
