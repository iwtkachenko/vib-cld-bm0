import { ObjectId } from 'mongodb'
import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { templateInput } from '@pm/shared'
import { notFound } from '../errors'
import type { TemplateDoc } from '../models'
import { templateDto } from '../serialize'
import { assertTypeFlows, toTypeFlowDocs } from '../services/projects'
import { oid, pathOid, type TeamScope } from '../tenancy'
import { tscope } from './guard'

const idParams = z.object({ id: z.string() })

async function load(ts: TeamScope, id: string): Promise<TemplateDoc> {
  const t = await ts.templates.findOne({ _id: pathOid(id, 'Template') })
  if (!t) throw notFound('Template not found')
  return t
}

export const templateRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/templates', async (req) => (await tscope(req).templates.find({}, { sort: { name: 1 } }).toArray()).map(templateDto))

  app.post('/templates', { schema: { body: templateInput } }, async (req, reply) => {
    const ts = tscope(req)
    const typeFlows = toTypeFlowDocs(req.body.typeFlows)
    await assertTypeFlows(ts, typeFlows)
    const doc: Omit<TemplateDoc, 'teamId'> = {
      _id: new ObjectId(),
      name: req.body.name,
      description: req.body.description,
      namePattern: req.body.namePattern,
      durationDays: req.body.durationDays,
      typeFlows,
      blueprints: req.body.blueprints.map((b) => ({ ...b, typeId: oid(b.typeId) })),
      projectsCreated: 0,
      createdAt: new Date(),
    }
    await ts.templates.insertOne(doc)
    return reply.status(201).send(templateDto({ ...doc, teamId: ts.teamId }))
  })

  app.get('/templates/:id', { schema: { params: idParams } }, async (req) => templateDto(await load(tscope(req), req.params.id)))

  app.patch('/templates/:id', { schema: { params: idParams, body: templateInput } }, async (req) => {
    const ts = tscope(req)
    const existing = await load(ts, req.params.id)
    const typeFlows = toTypeFlowDocs(req.body.typeFlows)
    await assertTypeFlows(ts, typeFlows, new Set(existing.typeFlows.map((t) => t.cardTypeId.toHexString())))
    const updated = await ts.templates.findOneAndUpdate(
      { _id: existing._id },
      {
        $set: {
          name: req.body.name,
          description: req.body.description,
          namePattern: req.body.namePattern,
          durationDays: req.body.durationDays,
          typeFlows,
          blueprints: req.body.blueprints.map((b) => ({ ...b, typeId: oid(b.typeId) })),
        },
      },
      { returnDocument: 'after' },
    )
    return templateDto(updated!)
  })

  app.delete('/templates/:id', { schema: { params: idParams } }, async (req) => {
    const ts = tscope(req)
    const t = await load(ts, req.params.id)
    await ts.templates.deleteOne({ _id: t._id })
    return { ok: true }
  })
}
