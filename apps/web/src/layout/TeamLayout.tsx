import { Center, Loader } from '@mantine/core'
import { Suspense, useEffect } from 'react'
import { Navigate, Outlet, useParams } from 'react-router'
import { useMe, useUpdateMe } from '../api/queries'
import { CardModalHost } from '../components/cards/CardModal'
import { AppLayout } from './AppLayout'

/** Layout of every /t/:teamId route: guards membership, remembers the last team, hosts the card modal. */
export function TeamLayout() {
  const { teamId } = useParams() as { teamId: string }
  const me = useMe().data
  const updateMe = useUpdateMe()
  const isMember = !!me?.teams.some((t) => t.team.id === teamId)
  const lastTeamId = me?.user.lastTeamId

  useEffect(() => {
    if (isMember && lastTeamId !== teamId) updateMe.mutate({ lastTeamId: teamId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMember, teamId, lastTeamId])

  if (!isMember) return <Navigate to="/" replace />
  return (
    <AppLayout teamId={teamId}>
      <Suspense fallback={<Center py="xl"><Loader /></Center>}>
        <Outlet />
      </Suspense>
      <CardModalHost />
    </AppLayout>
  )
}
