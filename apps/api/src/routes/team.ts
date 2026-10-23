import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { inviteInput, updateMemberInput, updateTeamInput } from '@pm/shared'
import { forbidden } from '../errors'
import { invitationDto, memberDto, teamDto } from '../serialize'
import { changeMemberRole, inviteToTeam, removeMember, revokeInvitation } from '../services/teams'
import { tscope } from './guard'

const idParams = z.object({ id: z.string() })
const userParams = z.object({ userId: z.string() })

/** Team settings, members and invitations (team-side). */
export const teamInfoRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', async (req) => {
    const ts = tscope(req)
    return { team: teamDto(ts.team), role: ts.role }
  })

  app.patch('/', { schema: { body: updateTeamInput } }, async (req) => {
    const ts = tscope(req)
    if (ts.role !== 'owner') throw forbidden('Only owners can edit the team')
    const set: Record<string, unknown> = {}
    if (req.body.name !== undefined) set.name = req.body.name
    if (req.body.key !== undefined) set.key = req.body.key
    const team = Object.keys(set).length
      ? await ts.deps.c.teams.findOneAndUpdate({ _id: ts.teamId }, { $set: set }, { returnDocument: 'after' })
      : ts.team
    return { team: teamDto(team ?? ts.team), role: ts.role }
  })

  app.get('/members', async (req) => {
    const ts = tscope(req)
    const members = await ts.memberships.find({}, { sort: { createdAt: 1 } }).toArray()
    const users = new Map((await ts.deps.c.users.find({ _id: { $in: members.map((m) => m.userId) } }).toArray()).map((u) => [u._id.toHexString(), u]))
    return members.flatMap((m) => {
      const u = users.get(m.userId.toHexString())
      return u ? [memberDto(m, u)] : []
    })
  })

  app.patch('/members/:userId', { schema: { params: userParams, body: updateMemberInput } }, async (req) => {
    await changeMemberRole(tscope(req), req.params.userId, req.body.role)
    return { ok: true }
  })

  app.delete('/members/:userId', { schema: { params: userParams } }, async (req) => {
    await removeMember(tscope(req), req.params.userId)
    return { ok: true }
  })

  app.get('/invitations', async (req) => {
    const ts = tscope(req)
    const invs = await ts.invitations.find({ status: 'pending' }, { sort: { createdAt: -1 } }).toArray()
    const inviters = new Map((await ts.deps.c.users.find({ _id: { $in: invs.map((i) => i.invitedBy) } }).toArray()).map((u) => [u._id.toHexString(), u]))
    return invs.map((i) => invitationDto(i, { inviter: inviters.get(i.invitedBy.toHexString()) }))
  })

  app.post('/invitations', { schema: { body: inviteInput } }, async (req, reply) => {
    const ts = tscope(req)
    const { invitation, emailSent } = await inviteToTeam(ts, req.body.email)
    return reply.status(201).send({ invitation: invitationDto(invitation, { inviter: ts.user }), emailSent })
  })

  app.delete('/invitations/:id', { schema: { params: idParams } }, async (req) => {
    await revokeInvitation(tscope(req), req.params.id)
    return { ok: true }
  })
}
