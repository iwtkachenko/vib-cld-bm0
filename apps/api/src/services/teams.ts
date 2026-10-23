import { ObjectId, type ClientSession } from 'mongodb'
import { deriveTeamKey, type CreateTeamInput } from '@pm/shared'
import type { Deps } from '../deps'
import type { InvitationDoc, TeamDoc, UserDoc } from '../models'
import { conflict, emailNotVerified, forbidden, isDuplicateKey, notFound } from '../errors'
import { pathOid, teamScope, type TeamScope } from '../tenancy'
import { withTxn } from '../txn'
import { escapeHtml } from '../auth/verification'
import { createStarterKit } from './starterKit'

const hex = (id: ObjectId) => id.toHexString()

export async function createTeam(deps: Deps, user: UserDoc, input: CreateTeamInput): Promise<TeamDoc> {
  const { c } = deps
  return withTxn(deps.client, async (session) => {
    const now = new Date()
    const team: TeamDoc = { _id: new ObjectId(), name: input.name, key: input.key ?? deriveTeamKey(input.name), createdBy: user._id, createdAt: now }
    await c.teams.insertOne(team, { session })
    await c.memberships.insertOne({ _id: new ObjectId(), teamId: team._id, userId: user._id, role: 'owner', createdAt: now }, { session })
    await c.counters.insertOne({ _id: `card:${hex(team._id)}`, seq: 0 }, { session })
    await c.users.updateOne({ _id: user._id }, { $set: { lastTeamId: team._id } }, { session })
    if (input.starterKit) await createStarterKit(teamScope(deps, team, user, 'owner'), session)
    return team
  })
}

async function otherOwners(ts: TeamScope, userId: ObjectId, session?: ClientSession): Promise<number> {
  return ts.memberships.count({ role: 'owner', userId: { $ne: userId } }, { session })
}

export async function changeMemberRole(ts: TeamScope, targetId: string, role: 'owner' | 'member') {
  if (ts.role !== 'owner') throw forbidden('Only owners can change roles')
  const userId = pathOid(targetId, 'Member')
  return withTxn(ts.deps.client, async (session) => {
    const m = await ts.memberships.findOne({ userId }, { session })
    if (!m) throw notFound('Member not found')
    if (m.role === 'owner' && role === 'member' && (await otherOwners(ts, userId, session)) === 0) {
      throw conflict('A team needs at least one owner')
    }
    await ts.memberships.updateOne({ userId }, { $set: { role } }, { session })
  })
}

export async function removeMember(ts: TeamScope, targetId: string): Promise<void> {
  const userId = pathOid(targetId, 'Member')
  const self = userId.equals(ts.user._id)
  if (!self && ts.role !== 'owner') throw forbidden('Only owners can remove members')
  await withTxn(ts.deps.client, async (session) => {
    const m = await ts.memberships.findOne({ userId }, { session })
    if (!m) throw notFound('Member not found')
    if (m.role === 'owner' && (await otherOwners(ts, userId, session)) === 0) {
      throw conflict(self ? 'You are the last owner; promote someone else before leaving' : 'A team needs at least one owner')
    }
    await ts.memberships.deleteOne({ userId }, { session })
    await ts.cards.updateMany({ assigneeIds: userId }, { $pull: { assigneeIds: userId } }, { session })
  })
}

export async function inviteToTeam(ts: TeamScope, email: string): Promise<{ invitation: InvitationDoc; emailSent: boolean }> {
  const { c, mailer, config } = ts.deps
  const existing = await c.users.findOne({ email })
  if (existing && (await ts.memberships.findOne({ userId: existing._id }))) throw conflict('This person is already a member of the team')
  const invitation: Omit<InvitationDoc, 'teamId'> = {
    _id: new ObjectId(), email, invitedBy: ts.user._id, status: 'pending', createdAt: new Date(), respondedAt: null,
  }
  try {
    await ts.invitations.insertOne(invitation)
  } catch (e) {
    if (isDuplicateKey(e)) throw conflict('This email already has a pending invitation')
    throw e
  }
  let emailSent = true
  const link = `${config.appUrl}/invitations`
  try {
    await mailer.send({
      to: email,
      subject: `${ts.user.name} invited you to "${ts.team.name}"`,
      text: `${ts.user.name} invited you to join the team "${ts.team.name}".\n\nSign in (or sign up with this email address) to review the invitation:\n${link}`,
      html: `<p><b>${escapeHtml(ts.user.name)}</b> invited you to join the team <b>${escapeHtml(ts.team.name)}</b>.</p><p>Sign in (or sign up with this email address) to <a href="${link}">review the invitation</a>.</p>`,
    })
  } catch (e) {
    emailSent = false
    ts.deps.config.env !== 'test' && console.error('Failed to send invitation email:', e)
  }
  return { invitation: { ...invitation, teamId: ts.teamId }, emailSent }
}

export async function revokeInvitation(ts: TeamScope, id: string): Promise<void> {
  const r = await ts.invitations.updateOne(
    { _id: pathOid(id, 'Invitation'), status: 'pending' }, { $set: { status: 'revoked', respondedAt: new Date() } },
  )
  if (r.matchedCount === 0) throw notFound('Invitation not found')
}

export function assertVerified(user: UserDoc): void {
  if (!user.emailVerifiedAt) throw emailNotVerified()
}

export async function respondToInvitation(deps: Deps, user: UserDoc, id: string, accept: boolean): Promise<TeamDoc | null> {
  assertVerified(user)
  const invId = pathOid(id, 'Invitation')
  const { c } = deps
  return withTxn(deps.client, async (session) => {
    const now = new Date()
    const inv = await c.invitations.findOneAndUpdate(
      { _id: invId, email: user.email, status: 'pending' },
      { $set: { status: accept ? 'accepted' : 'rejected', respondedAt: now } },
      { returnDocument: 'after', session },
    )
    if (!inv) throw notFound('Invitation not found')
    if (!accept) return null
    await c.memberships.updateOne(
      { teamId: inv.teamId, userId: user._id },
      { $setOnInsert: { _id: new ObjectId(), role: 'member', createdAt: now } },
      { upsert: true, session },
    )
    await c.users.updateOne({ _id: user._id }, { $set: { lastTeamId: inv.teamId } }, { session })
    return c.teams.findOne({ _id: inv.teamId }, { session })
  })
}
