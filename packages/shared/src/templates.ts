import { z } from 'zod'
import { idSchema, shortIdSchema } from './ids'
import { typeFlowSchema } from './flows'

export const blueprintSchema = z.object({
  id: shortIdSchema,
  typeId: idSchema,
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20000).default(''),
})

export const templateInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).default(''),
    namePattern: z.string().trim().min(1).max(120).default('Project {n}'),
    durationDays: z.number().int().min(1).max(730).nullable().default(null),
    typeFlows: z.array(typeFlowSchema).min(1).max(30),
    blueprints: z.array(blueprintSchema).max(100).default([]),
  })
  .superRefine((t, ctx) => {
    const typeIds = new Set(t.typeFlows.map((tf) => tf.cardTypeId))
    if (typeIds.size !== t.typeFlows.length)
      ctx.addIssue({ code: 'custom', message: 'Each card type can be mapped once', path: ['typeFlows'] })
    t.blueprints.forEach((b, i) => {
      if (!typeIds.has(b.typeId))
        ctx.addIssue({ code: 'custom', message: 'Blueprint type is not mapped in this template', path: ['blueprints', i, 'typeId'] })
    })
    const bp = new Set<string>()
    t.blueprints.forEach((b, i) => {
      if (bp.has(b.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate blueprint id', path: ['blueprints', i, 'id'] })
      bp.add(b.id)
    })
  })

export type TemplateInput = z.infer<typeof templateInput>
