import { z } from 'zod'
import { dateStringSchema, idSchema, shortIdSchema } from './ids'
import { typeFlowSchema } from './flows'

const nameSchema = z.string().trim().min(1).max(120)
const descSchema = z.string().trim().max(2000)

const typeFlowsSchema = z.array(typeFlowSchema).max(30).superRefine((tfs, ctx) => {
  if (new Set(tfs.map((t) => t.cardTypeId)).size !== tfs.length)
    ctx.addIssue({ code: 'custom', message: 'Each card type can be mapped once' })
})

export const createProjectInput = z
  .object({
    templateId: idSchema.optional(),
    name: nameSchema.optional(),
    description: descSchema.optional(),
    startDate: dateStringSchema.optional(),
    endDate: dateStringSchema.optional(),
    typeFlows: typeFlowsSchema.optional(),
    /** Template blueprint ids to instantiate as cards (all when omitted and a template is used). */
    blueprintIds: z.array(shortIdSchema).max(100).optional(),
    newCards: z
      .array(
        z.object({
          typeId: idSchema,
          title: z.string().trim().min(1).max(200),
          body: z.string().max(50000).default(''),
          assigneeIds: z.array(idSchema).max(20).default([]),
        }),
      )
      .max(100)
      .default([]),
    cards: z.array(z.object({ cardId: idSchema, mode: z.enum(['link', 'move']) })).max(200).default([]),
  })
  .superRefine((p, ctx) => {
    if (!p.templateId && !p.name) ctx.addIssue({ code: 'custom', message: 'Name is required', path: ['name'] })
    if (!p.templateId && (!p.typeFlows || p.typeFlows.length === 0))
      ctx.addIssue({ code: 'custom', message: 'Map at least one card type to a flow', path: ['typeFlows'] })
    if (p.startDate && p.endDate && p.endDate < p.startDate)
      ctx.addIssue({ code: 'custom', message: 'End date is before start date', path: ['endDate'] })
  })

export const updateProjectInput = z.object({
  name: nameSchema.optional(),
  description: descSchema.optional(),
  startDate: dateStringSchema.nullable().optional(),
  endDate: dateStringSchema.nullable().optional(),
  typeFlows: typeFlowsSchema.optional(),
})
export const listProjectsQuery = z.object({ state: z.enum(['active', 'archived']).optional() })
export const completeProjectInput = z.object({ carryOverToProjectId: idSchema.optional() })
export const saveAsTemplateInput = z.object({
  name: z.string().trim().min(1).max(80),
  namePattern: z.string().trim().min(1).max(120).optional(),
  durationDays: z.number().int().min(1).max(730).nullable().optional(),
  includeCards: z.boolean().default(false),
})

export type CreateProjectInput = z.infer<typeof createProjectInput>
export type UpdateProjectInput = z.infer<typeof updateProjectInput>
