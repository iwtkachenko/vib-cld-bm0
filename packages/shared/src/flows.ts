import { z } from 'zod'
import { STATUS_CATEGORIES } from './types'
import { idSchema, shortIdSchema } from './ids'
import { validateFlowDef } from './domain/flow'

export const statusDefSchema = z.object({
  id: shortIdSchema,
  name: z.string().trim().min(1).max(40),
  category: z.enum(STATUS_CATEGORIES as [string, ...string[]]) as z.ZodType<(typeof STATUS_CATEGORIES)[number]>,
  color: z.string().trim().max(20).default('gray'),
})

export const flowInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(500).default(''),
    statuses: z.array(statusDefSchema).min(1).max(20),
    initialStatusId: shortIdSchema,
    transitions: z.array(z.object({ from: shortIdSchema, to: shortIdSchema })).max(500),
  })
  .superRefine((f, ctx) => {
    for (const message of validateFlowDef(f)) ctx.addIssue({ code: 'custom', message, path: [] })
  })

export const typeFlowSchema = z.object({ cardTypeId: idSchema, flowId: idSchema })

export type FlowInput = z.infer<typeof flowInput>
