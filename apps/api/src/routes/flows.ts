import { ObjectId } from 'mongodb'
import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { flowInput, type FlowUsageDto } from '@pm/shared'
import { conflict, notFound } from '../errors'
import type { FlowDoc } from '../models'
import { flowDto } from '../serialize'
import { pathOid, type TeamScope } from '../tenancy'
import { withTxn } from '../txn'
import { tscope } from './guard'

const idParams = z.object({ id: z.string() })

async function load(ts: TeamScope, id: string): Promise<FlowDoc> {
  const f = await ts.flows.findOne({ _id: pathOid(id, 'Flow') })
  if (!f) throw notFound('Flow not found')
  return f
}

async function usage(ts: TeamScope, flow: FlowDoc): Promise<FlowUsageDto> {
  const rows = await ts.cards.aggregate<{ _id: string; n: number }>([
    { $match: { flowId: flow._id } },
    { $group: { _id: '$statusId', n: { $sum: 1 } } },
  ]).toArray()
  const [projectCount, templateCount] = await Promise.all([
    ts.projects.count({ 'typeFlows.flowId': flow._id }),
    ts.templates.count({ 'typeFlows.flowId': flow._id }),
  ])
  return {
    byStatus: Object.fromEntries(rows.map((r) => [r._id, r.n])),
    cardCount: rows.reduce((s, r) => s + r.n, 0),
    projectCount,
    templateCount,
  }
}

export const flowRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/flows', async (req) => (await tscope(req).flows.find({}, { sort: { name: 1 } }).toArray()).map(flowDto))

  app.post('/flows', { schema: { body: flowInput } }, async (req, reply) => {
    const ts = tscope(req)
    const doc: Omit<FlowDoc, 'teamId'> = { _id: new ObjectId(), ...req.body, createdAt: new Date() }
    await ts.flows.insertOne(doc)
    return reply.status(201).send(flowDto({ ...doc, teamId: ts.teamId }))
  })

  app.get('/flows/:id', { schema: { params: idParams } }, async (req) => flowDto(await load(tscope(req), req.params.id)))

  app.get('/flows/:id/usage', { schema: { params: idParams } }, async (req) => {
    const ts = tscope(req)
    return usage(ts, await load(ts, req.params.id))
  })

  app.patch('/flows/:id', { schema: { params: idParams, body: flowInput } }, async (req) => {
    const ts = tscope(req)
    const existing = await load(ts, req.params.id)
    return flowDto(
      await withTxn(ts.deps.client, async (session) => {
        const now = new Date()
        for (const old of existing.statuses) {
          const next = req.body.statuses.find((s) => s.id === old.id)
          if (!next) {
            const n = await ts.cards.count({ flowId: existing._id, statusId: old.id }, { session })
            if (n > 0) throw conflict(`Status "${old.name}" is used by ${n} card(s) and cannot be removed`, { statusId: old.id, cards: n })
          } else if (next.category !== old.category) {
            // Keep denormalized card state in sync with the status category.
            await ts.cards.updateMany(
              { flowId: existing._id, statusId: old.id },
              next.category === 'done'
                ? [{ $set: { statusCategory: next.category, completedAt: { $ifNull: ['$completedAt', now] } } }]
                : [{ $set: { statusCategory: next.category, completedAt: null } }],
              { session },
            )
          }
        }
        const updated = await ts.flows.findOneAndUpdate({ _id: existing._id }, { $set: req.body }, { returnDocument: 'after', session })
        return updated!
      }),
    )
  })

  app.delete('/flows/:id', { schema: { params: idParams } }, async (req) => {
    const ts = tscope(req)
    const flow = await load(ts, req.params.id)
    const u = await usage(ts, flow)
    if (u.cardCount + u.projectCount + u.templateCount > 0) {
      throw conflict(`Flow is in use (${u.cardCount} cards, ${u.projectCount} projects, ${u.templateCount} templates)`, u)
    }
    await ts.flows.deleteOne({ _id: flow._id })
    return { ok: true }
  })
}
