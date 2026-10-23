import { z } from 'zod'
import { idSchema, shortIdSchema } from './ids'

export const fieldValuesSchema = z.record(z.string(), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]))
const titleSchema = z.string().trim().min(1).max(200)
const bodySchema = z.string().max(50000)
const assigneesSchema = z.array(idSchema).max(20)

export const createCardInput = z.object({
  projectId: idSchema,
  typeId: idSchema,
  title: titleSchema,
  body: bodySchema.default(''),
  fields: fieldValuesSchema.default({}),
  assigneeIds: assigneesSchema.default([]),
})
export const updateCardInput = z.object({
  title: titleSchema.optional(),
  body: bodySchema.optional(),
  fields: fieldValuesSchema.optional(),
  assigneeIds: assigneesSchema.optional(),
})
export const transitionInput = z.object({
  expectedStatusId: shortIdSchema,
  toStatusId: shortIdSchema,
  /** Project whose ordering `rank` refers to. */
  projectId: idSchema.optional(),
  /** Fractional-indexing key in the project's ordering. */
  rank: z.string().min(1).max(100).optional(),
})
export const setPrimaryInput = z.object({
  projectId: idSchema,
  keepPreviousLink: z.boolean().default(true),
})
export const linkInput = z.object({ projectId: idSchema })
export const listCardsQuery = z.object({
  projectId: idSchema.optional(),
  assigneeId: idSchema.optional(),
  typeId: idSchema.optional(),
  statusCategory: z.enum(['todo', 'in_progress', 'done']).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
})

export type CreateCardInput = z.infer<typeof createCardInput>
export type UpdateCardInput = z.infer<typeof updateCardInput>
export type ListCardsQuery = z.infer<typeof listCardsQuery>
