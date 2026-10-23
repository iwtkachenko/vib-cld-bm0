import { Center, Loader } from '@mantine/core'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useMe } from '../api/queries'

export function FullPageLoader() {
  return (
    <Center h="100vh">
      <Loader />
    </Center>
  )
}

export function RequireAuth() {
  const { data: me, isPending } = useMe()
  const location = useLocation()
  if (isPending) return <FullPageLoader />
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}

export function GuestOnly() {
  const { data: me, isPending } = useMe()
  if (isPending) return <FullPageLoader />
  if (me) return <Navigate to="/" replace />
  return <Outlet />
}

/** `/` → last used team, else first team, else the welcome page. */
export function HomeRedirect() {
  const { data: me, isPending } = useMe()
  if (isPending) return <FullPageLoader />
  if (!me) return <Navigate to="/login" replace />
  if (me.teams.length === 0) return <Navigate to="/welcome" replace />
  const target = me.teams.find((t) => t.team.id === me.user.lastTeamId) ?? me.teams[0]!
  return <Navigate to={`/t/${target.team.id}/projects`} replace />
}
