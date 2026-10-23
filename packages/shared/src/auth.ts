import { z } from 'zod'

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))
const nameSchema = z.string().trim().min(1).max(80)

export const registerInput = z.object({
  email: emailSchema,
  name: nameSchema,
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
})
export const loginInput = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
})
export const verifyEmailInput = z.object({ token: z.string().min(10).max(200) })
export const updateMeInput = z.object({
  name: nameSchema.optional(),
  lastTeamId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
})

export type RegisterInput = z.infer<typeof registerInput>
export type LoginInput = z.infer<typeof loginInput>
