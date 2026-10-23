import { Alert, Container, Loader, Stack } from '@mantine/core'
import { IconMailOpened } from '@tabler/icons-react'
import { ApiError } from '../api/client'
import { useMyInvitations } from '../api/queries'
import { EmptyState } from '../components/common/EmptyState'
import { InvitationList } from '../components/common/InvitationList'
import { PageHeader } from '../components/common/PageHeader'

export function InvitationsPage() {
  const q = useMyInvitations()
  const notVerified = q.error instanceof ApiError && q.error.code === 'email_not_verified'
  return (
    <Container size="sm">
      <PageHeader title="Invitations" description="Teams that invited you. Accept to join, or decline." />
      {q.isPending && <Loader />}
      {notVerified && <Alert color="yellow" variant="light">Verify your email address to see invitations sent to you.</Alert>}
      {q.isError && !notVerified && <Alert color="red" variant="light">{q.error.message}</Alert>}
      {q.data && q.data.length === 0 && <EmptyState icon={<IconMailOpened />} title="No pending invitations" text="When someone invites you to a team, it shows up here." />}
      {q.data && q.data.length > 0 && <Stack><InvitationList invitations={q.data} /></Stack>}
    </Container>
  )
}
