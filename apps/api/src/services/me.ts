import type { MeDto } from '@pm/shared'
import type { Deps } from '../deps'
import type { UserDoc } from '../models'
import { teamDto, userDto } from '../serialize'

export async function buildMe(d: Deps, user: UserDoc): Promise<MeDto> {
  const memberships = await d.c.memberships.find({ userId: user._id }, { sort: { createdAt: 1 } }).toArray()
  const teams = await d.c.teams.find({ _id: { $in: memberships.map((m) => m.teamId) } }).toArray()
  const byId = new Map(teams.map((t) => [t._id.toHexString(), t]))
  const pending = user.emailVerifiedAt ? await d.c.invitations.countDocuments({ email: user.email, status: 'pending' }) : 0
  return {
    user: userDto(user),
    teams: memberships.flatMap((m) => {
      const t = byId.get(m.teamId.toHexString())
      return t ? [{ team: teamDto(t), role: m.role }] : []
    }),
    pendingInvitations: pending,
  }
}
