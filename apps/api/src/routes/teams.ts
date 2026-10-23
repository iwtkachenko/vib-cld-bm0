import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { requireUser } from '../auth/hooks'
import { cardRoutes } from './cards'
import { cardTypeRoutes } from './cardTypes'
import { flowRoutes } from './flows'
import { requireMember } from './guard'
import { projectRoutes } from './projects'
import { teamInfoRoutes } from './team'
import { templateRoutes } from './templates'

/** Everything under /api/teams/:teamId — membership is enforced before validation for every route. */
export const teamRoutes: FastifyPluginAsyncZod = async (app) => {
  app.decorateRequest('ts', null)
  app.addHook('preValidation', requireUser)
  app.addHook('preValidation', requireMember)
  await app.register(teamInfoRoutes)
  await app.register(cardTypeRoutes)
  await app.register(flowRoutes)
  await app.register(templateRoutes)
  await app.register(projectRoutes)
  await app.register(cardRoutes)
}
