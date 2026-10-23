import type { FastifyRequest } from 'fastify'
import { currentUser } from '../auth/hooks'
import { notFound } from '../errors'
import { pathOid, teamScope, type TeamScope } from '../tenancy'

declare module 'fastify' {
  interface FastifyRequest {
    ts: TeamScope | null
  }
}

/** preValidation hook for /api/teams/:teamId/*: non-members always get 404, before any body validation. */
export async function requireMember(req: FastifyRequest): Promise<void> {
  const d = req.server.deps
  const user = currentUser(req)
  const teamId = pathOid((req.params as { teamId?: string }).teamId ?? '', 'Team')
  const membership = await d.c.memberships.findOne({ teamId, userId: user._id })
  const team = membership ? await d.c.teams.findOne({ _id: teamId }) : null
  if (!membership || !team) throw notFound('Team not found')
  req.ts = teamScope(d, team, user, membership.role)
}

export function tscope(req: FastifyRequest): TeamScope {
  if (!req.ts) throw notFound('Team not found')
  return req.ts
}
