import { Container, Paper, Stack, Text, Title } from '@mantine/core'
import { Navigate } from 'react-router'
import { useMe, useMyInvitations } from '../api/queries'
import { CreateTeamForm } from '../components/common/CreateTeamForm'
import { InvitationList } from '../components/common/InvitationList'
import { AppLayout } from '../layout/AppLayout'

export function WelcomePage() {
  const me = useMe().data
  const verified = me?.user.emailVerified ?? false
  const invitations = useMyInvitations(verified)
  if (!me) return <Navigate to="/login" replace />
  return (
    <AppLayout>
      <Container size="sm" py="xl">
        <Stack gap="xl">
          <div>
            <Title order={2}>Welcome, {me.user.name.split(' ')[0]}!</Title>
            <Text c="dimmed">Create your own team or join one you were invited to.</Text>
          </div>
          {verified && (invitations.data?.length ?? 0) > 0 && (
            <Stack gap="xs">
              <Title order={4}>You have been invited</Title>
              <InvitationList invitations={invitations.data!} />
            </Stack>
          )}
          <Paper withBorder p="lg">
            <Title order={4} mb="sm">Create a team</Title>
            <CreateTeamForm />
          </Paper>
        </Stack>
      </Container>
    </AppLayout>
  )
}
