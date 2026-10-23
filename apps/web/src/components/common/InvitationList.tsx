import { Button, Card, Group, Stack, Text } from '@mantine/core'
import { IconCheck, IconX } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useNavigate } from 'react-router'
import type { InvitationDto } from '@pm/shared'
import { useAcceptInvitation, useRejectInvitation } from '../../api/queries'
import { fromNow } from '../../utils/format'

/** Pending invitations addressed to the signed-in user, with accept / decline. */
export function InvitationList({ invitations, compact = false }: { invitations: InvitationDto[]; compact?: boolean }) {
  const navigate = useNavigate()
  const accept = useAcceptInvitation()
  const reject = useRejectInvitation()
  return (
    <Stack gap="xs">
      {invitations.map((inv) => (
        <Card key={inv.id} withBorder padding={compact ? 'xs' : 'sm'}>
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text fw={600}>{inv.team?.name ?? 'A team'}</Text>
              <Text size="xs" c="dimmed">Invited by {inv.invitedBy?.name ?? 'someone'} · {fromNow(inv.createdAt)}</Text>
            </div>
            <Group gap="xs" wrap="nowrap">
              <Button
                size="xs" variant="default" leftSection={<IconX size={14} />}
                loading={reject.isPending && reject.variables === inv.id}
                onClick={() => reject.mutate(inv.id, { onSuccess: () => notifications.show({ message: `Declined the invitation to ${inv.team?.name}` }) })}
              >
                Decline
              </Button>
              <Button
                size="xs" leftSection={<IconCheck size={14} />}
                loading={accept.isPending && accept.variables === inv.id}
                onClick={() =>
                  accept.mutate(inv.id, {
                    onSuccess: ({ team }) => {
                      notifications.show({ color: 'green', message: `You joined ${team?.name ?? 'the team'}` })
                      if (team) navigate(`/t/${team.id}/projects`)
                    },
                  })
                }
              >
                Accept
              </Button>
            </Group>
          </Group>
        </Card>
      ))}
    </Stack>
  )
}
