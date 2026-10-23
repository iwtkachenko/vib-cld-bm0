import type { z } from 'zod'
import type { registerInput, loginInput } from './auth'
import type { createTeamInput } from './teams'
import type { cardTypeInput } from './cardTypes'
import type { flowInput } from './flows'
import type { templateInput } from './templates'
import type { createProjectInput, updateProjectInput, saveAsTemplateInput, completeProjectInput } from './projects'
import type { createCardInput, updateCardInput, transitionInput, setPrimaryInput, listCardsQuery } from './cards'

/** Request body types as a client sends them (defaults optional). */
export type RegisterBody = z.input<typeof registerInput>
export type LoginBody = z.input<typeof loginInput>
export type CreateTeamBody = z.input<typeof createTeamInput>
export type CardTypeBody = z.input<typeof cardTypeInput>
export type FlowBody = z.input<typeof flowInput>
export type TemplateBody = z.input<typeof templateInput>
export type CreateProjectBody = z.input<typeof createProjectInput>
export type UpdateProjectBody = z.input<typeof updateProjectInput>
export type SaveAsTemplateBody = z.input<typeof saveAsTemplateInput>
export type CompleteProjectBody = z.input<typeof completeProjectInput>
export type CreateCardBody = z.input<typeof createCardInput>
export type UpdateCardBody = z.input<typeof updateCardInput>
export type TransitionBody = z.input<typeof transitionInput>
export type SetPrimaryBody = z.input<typeof setPrimaryInput>
export type ListCardsParams = z.input<typeof listCardsQuery>
