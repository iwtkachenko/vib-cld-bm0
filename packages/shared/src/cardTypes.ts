import { z } from 'zod'
import { FIELD_KINDS } from './types'
import { shortIdSchema } from './ids'

export const fieldDefSchema = z
  .object({
    id: shortIdSchema,
    name: z.string().trim().min(1).max(60),
    kind: z.enum(FIELD_KINDS as [string, ...string[]]) as z.ZodType<(typeof FIELD_KINDS)[number]>,
    options: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
    required: z.boolean().default(false),
  })
  .superRefine((f, ctx) => {
    if (f.kind === 'select' && (!f.options || f.options.length === 0)) {
      ctx.addIssue({ code: 'custom', message: 'Select fields need at least one option', path: ['options'] })
    }
    if (f.options && new Set(f.options.map((o) => o.toLowerCase())).size !== f.options.length) {
      ctx.addIssue({ code: 'custom', message: 'Options must be unique', path: ['options'] })
    }
  })

export const cardTypeInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    icon: z.string().trim().max(8).default('📝'),
    color: z.string().trim().max(20).default('blue'),
    description: z.string().trim().max(500).default(''),
    fields: z.array(fieldDefSchema).max(30).default([]),
  })
  .superRefine((t, ctx) => {
    const ids = new Set<string>()
    const names = new Set<string>()
    t.fields.forEach((f, i) => {
      if (ids.has(f.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate field id', path: ['fields', i, 'id'] })
      if (names.has(f.name.toLowerCase()))
        ctx.addIssue({ code: 'custom', message: 'Duplicate field name', path: ['fields', i, 'name'] })
      ids.add(f.id)
      names.add(f.name.toLowerCase())
    })
  })

export type CardTypeInput = z.infer<typeof cardTypeInput>
