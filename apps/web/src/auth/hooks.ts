import { useParams } from 'react-router'
import type { UserDto } from '@pm/shared'
import { useMe } from '../api/queries'

/** The team id from the URL (`/t/:teamId/...`). Only call below the team layout route. */
export function useTeamId(): string {
  const { teamId } = useParams()
  if (!teamId) throw new Error('useTeamId used outside /t/:teamId')
  return teamId
}

/** Current team, the user's role in it and the signed-in user. Only call below the team layout route. */
export function useActiveTeam() {
  const teamId = useTeamId()
  const me = useMe().data ?? null
  const membership = me?.teams.find((t) => t.team.id === teamId)
  return { teamId, team: membership?.team, role: membership?.role, isOwner: membership?.role === 'owner', me, user: me?.user as UserDto }
}
