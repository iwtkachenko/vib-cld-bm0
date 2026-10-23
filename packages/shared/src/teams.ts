import { z } from 'zod'
import { emailSchema } from './auth'

export const teamKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Key: 2-10 letters/digits, starting with a letter'))
const teamNameSchema = z.string().trim().min(1).max(80)

export const createTeamInput = z.object({
  name: teamNameSchema,
  key: teamKeySchema.optional(),
  starterKit: z.boolean().default(false),
})
export const updateTeamInput = z.object({
  name: teamNameSchema.optional(),
  key: teamKeySchema.optional(),
})
export const inviteInput = z.object({ email: emailSchema })
export const updateMemberInput = z.object({ role: z.enum(['owner', 'member']) })

export type CreateTeamInput = z.infer<typeof createTeamInput>
