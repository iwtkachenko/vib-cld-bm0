import { Badge, Button, Divider, Group, Menu, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { IconCheck, IconChevronDown, IconMailOpened, IconPlus, IconUsersGroup } from '@tabler/icons-react'
import { useNavigate } from 'react-router'
import { useMe, useMyInvitations } from '../api/queries'
import { CreateTeamForm } from '../components/common/CreateTeamForm'
import { InvitationList } from '../components/common/InvitationList'

export function TeamSwitcher({ currentTeamId }: { currentTeamId?: string }) {
  const navigate = useNavigate()
  const me = useMe().data
  const verified = me?.user.emailVerified ?? false
  const invitations = useMyInvitations(verified && (me?.pendingInvitations ?? 0) > 0)
  const current = me?.teams.find((t) => t.team.id === currentTeamId)
  const pending = verified ? (invitations.data ?? []) : []

  const openCreate = () => {
    const id = 'create-team'
    modals.open({ modalId: id, title: 'Create a team', centered: true, children: <CreateTeamForm onDone={() => modals.close(id)} /> })
  }

  return (
    <Menu width={340} position="bottom-start" shadow="md" withinPortal>
      <Menu.Target>
        <Button variant="subtle" color="gray" rightSection={<IconChevronDown size={14} />} leftSection={<IconUsersGroup size={16} />} data-testid="team-switcher">
          <Group gap={6} wrap="nowrap">
            <Text fw={600} size="sm" truncate maw={160}>{current?.team.name ?? 'Select team'}</Text>
            {current && <Badge size="xs" variant="light">{current.team.key}</Badge>}
          </Group>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Your teams</Menu.Label>
        {me?.teams.map(({ team, role }) => (
          <Menu.Item
            key={team.id}
            leftSection={team.id === currentTeamId ? <IconCheck size={14} /> : <span style={{ width: 14, display: 'inline-block' }} />}
            rightSection={<Badge size="xs" variant="outline" color={role === 'owner' ? 'indigo' : 'gray'}>{role}</Badge>}
            onClick={() => navigate(`/t/${team.id}/projects`)}
          >
            {team.name}
          </Menu.Item>
        ))}
        {!me?.teams.length && <Text size="sm" c="dimmed" px="sm" py={4}>You are not in any team yet.</Text>}
        {pending.length > 0 && (
          <>
            <Divider my={4} />
            <Menu.Label>Invitations</Menu.Label>
            <div style={{ padding: '0 8px 4px' }} onClick={(e) => e.stopPropagation()}>
              <InvitationList invitations={pending} compact />
            </div>
          </>
        )}
        <Divider my={4} />
        <Menu.Item leftSection={<IconPlus size={14} />} onClick={openCreate}>Create team…</Menu.Item>
        <Menu.Item leftSection={<IconMailOpened size={14} />} onClick={() => navigate('/invitations')}>
          All invitations{me && me.pendingInvitations > 0 ? ` (${me.pendingInvitations})` : ''}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
