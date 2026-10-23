import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { createTeamInput, updateMeInput } from '@pm/shared'
import { currentUser } from '../auth/hooks'
import { unprocessable } from '../errors'
import { invitationDto, teamDto } from '../serialize'
import { buildMe } from '../services/me'
import { assertVerified, createTeam, respondToInvitation } from '../services/teams'
import { oid } from '../tenancy'

const idParams = z.object({ id: z.string() })

/** Routes of the signed-in user that are not scoped to a team. */
export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/me', async (req) => buildMe(app.deps, currentUser(req)))

  app.patch('/me', { schema: { body: updateMeInput } }, async (req) => {
    const d = app.deps
    const user = currentUser(req)
    const set: Record<string, unknown> = {}
    if (req.body.name !== undefined) set.name = req.body.name
    if (req.body.lastTeamId !== undefined) {
      const m = await d.c.memberships.findOne({ userId: user._id, teamId: oid(req.body.lastTeamId) })
      if (!m) throw unprocessable('You are not a member of that team')
      set.lastTeamId = m.teamId
    }
    const updated = Object.keys(set).length
      ? await d.c.users.findOneAndUpdate({ _id: user._id }, { $set: set }, { returnDocument: 'after' })
      : user
    return buildMe(d, updated ?? user)
  })

  app.post('/teams', { schema: { body: createTeamInput } }, async (req, reply) => {
    const d = app.deps
    const user = currentUser(req)
    const team = await createTeam(d, user, req.body)
    const fresh = (await d.c.users.findOne({ _id: user._id })) ?? user
    return reply.status(201).send({ team: teamDto(team), me: await buildMe(d, fresh) })
  })

  // Invitations addressed to the signed-in user's (verified) email.
  app.get('/invitations', async (req) => {
    const d = app.deps
    const user = currentUser(req)
    assertVerified(user)
    const invs = await d.c.invitations.find({ email: user.email, status: 'pending' }, { sort: { createdAt: -1 } }).toArray()
    const teams = new Map((await d.c.teams.find({ _id: { $in: invs.map((i) => i.teamId) } }).toArray()).map((t) => [t._id.toHexString(), t]))
    const inviters = new Map((await d.c.users.find({ _id: { $in: invs.map((i) => i.invitedBy) } }).toArray()).map((u) => [u._id.toHexString(), u]))
    return invs.flatMap((i) => {
      const team = teams.get(i.teamId.toHexString())
      return team ? [invitationDto(i, { team, inviter: inviters.get(i.invitedBy.toHexString()) })] : []
    })
  })

  app.post('/invitations/:id/accept', { schema: { params: idParams } }, async (req) => {
    const d = app.deps
    const user = currentUser(req)
    const team = await respondToInvitation(d, user, req.params.id, true)
    const fresh = (await d.c.users.findOne({ _id: user._id })) ?? user
    return { team: team ? teamDto(team) : null, me: await buildMe(d, fresh) }
  })

  app.post('/invitations/:id/reject', { schema: { params: idParams } }, async (req) => {
    const d = app.deps
    const user = currentUser(req)
    await respondToInvitation(d, user, req.params.id, false)
    return { me: await buildMe(d, user) }
  })
}
