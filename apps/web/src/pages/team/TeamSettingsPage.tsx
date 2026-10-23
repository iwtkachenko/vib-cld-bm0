import {
  ActionIcon, Alert, Badge, Box, Button, Group, Loader, Paper, Select, Stack, Table, Text, TextInput, Title, Tooltip,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { IconLogout, IconMail, IconSend, IconUserMinus } from '@tabler/icons-react'
import { useNavigate } from 'react-router'
import type { MemberDto, Role } from '@pm/shared'
import {
  qk, useInvite, useMembers, useRemoveMember, useRevokeInvitation, useSetRole, useTeamInvitations, useUpdateTeam,
} from '../../api/queries'
import { useActiveTeam } from '../../auth/hooks'
import { UserAvatar } from '../../components/common/badges'
import { confirmAction } from '../../components/common/confirm'
import { PageHeader } from '../../components/common/PageHeader'
import { formatDate, fromNow } from '../../utils/format'

const ROLE_OPTIONS = [{ value: 'owner', label: 'Owner' }, { value: 'member', label: 'Member' }]
const KEY_RE = /^[A-Za-z][A-Za-z0-9]{1,9}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function TeamDetails({ teamId, name, teamKey, isOwner }: { teamId: string; name: string; teamKey: string; isOwner: boolean }) {
  const update = useUpdateTeam(teamId)
  const form = useForm({
    mode: 'controlled',
    initialValues: { name, key: teamKey },
    validate: {
      name: (v) => (v.trim() ? (v.trim().length > 80 ? 'Max 80 characters' : null) : 'Name is required'),
      key: (v) => (KEY_RE.test(v.trim()) ? null : 'Key: 2-10 letters/digits, starting with a letter'),
    },
  })
  const nextKey = form.values.key.trim().toUpperCase()
  const dirty = form.values.name.trim() !== name || nextKey !== teamKey

  return (
    <Paper withBorder p="md">
      <Title order={4} mb="xs">Team details</Title>
      <form
        noValidate
        onSubmit={form.onSubmit((v) => {
          const body: { name?: string; key?: string } = {}
          if (v.name.trim() !== name) body.name = v.name.trim()
          if (v.key.trim().toUpperCase() !== teamKey) body.key = v.key.trim().toUpperCase()
          update.mutate(body, { onSuccess: () => notifications.show({ color: 'green', message: 'Team details saved' }) })
        })}
      >
        <Stack gap="sm" maw={460}>
          <TextInput label="Team name" readOnly={!isOwner} data-testid="team-name" {...form.getInputProps('name')} />
          <TextInput
            label="Key" readOnly={!isOwner} data-testid="team-key"
            description="Prefix of card keys, e.g. ACME-12. Changing it renames the keys of all existing cards."
            {...form.getInputProps('key')}
          />
          {isOwner ? (
            <Group>
              <Button type="submit" disabled={!dirty} loading={update.isPending} data-testid="save-team">Save</Button>
            </Group>
          ) : (
            <Text size="xs" c="dimmed">Only owners can edit the team details.</Text>
          )}
        </Stack>
      </form>
    </Paper>
  )
}

function MembersSection({ teamId, isOwner, myId }: { teamId: string; isOwner: boolean; myId: string | undefined }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const members = useMembers(teamId)
  const setRole = useSetRole(teamId)
  const removeMember = useRemoveMember(teamId)

  const changeRole = (m: MemberDto, role: Role) =>
    setRole.mutate(
      { userId: m.userId, role },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', message: `${m.name} is now ${role === 'owner' ? 'an owner' : 'a member'}` })
          if (m.userId === myId) void qc.invalidateQueries({ queryKey: qk.me })
        },
      },
    )

  const askRemove = (m: MemberDto) =>
    confirmAction({
      title: `Remove ${m.name}?`,
      message: `${m.name} loses access to this team and is unassigned from all cards. They can be invited again later.`,
      confirmLabel: 'Remove',
      onConfirm: () => removeMember.mutate(m.userId, { onSuccess: () => notifications.show({ message: `${m.name} was removed from the team` }) }),
    })

  const askLeave = (m: MemberDto) =>
    confirmAction({
      title: 'Leave this team?',
      message: 'You will lose access to its projects and cards, and be unassigned from every card. You will need a new invitation to come back.',
      confirmLabel: 'Leave team',
      onConfirm: () =>
        removeMember.mutate(m.userId, {
          onSuccess: () => {
            void qc.invalidateQueries({ queryKey: qk.me })
            notifications.show({ message: 'You left the team' })
            navigate('/')
          },
        }),
    })

  const list = members.data ?? []
  return (
    <Paper withBorder p="md">
      <Title order={4} mb="xs">Members</Title>
      {members.isPending && <Loader size="sm" />}
      {members.isError && <Alert color="red" title="Could not load members">{members.error.message}</Alert>}
      {members.isSuccess && (
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing="xs" data-testid="members-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Member</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Joined</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.map((m) => {
                const self = m.userId === myId
                return (
                  <Table.Tr key={m.userId} data-testid="member-row">
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <UserAvatar member={m} size={32} />
                        <Box style={{ minWidth: 0 }}>
                          <Text size="sm" fw={500}>{m.name}{self && <Text span size="xs" c="dimmed"> (you)</Text>}</Text>
                          <Text size="xs" c="dimmed">{m.email}</Text>
                        </Box>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {isOwner ? (
                        <Select
                          size="xs" w={120} aria-label={`Role of ${m.name}`} data={ROLE_OPTIONS} value={m.role} allowDeselect={false}
                          disabled={setRole.isPending && setRole.variables?.userId === m.userId} data-testid="member-role"
                          onChange={(r) => r && r !== m.role && changeRole(m, r as Role)}
                        />
                      ) : (
                        <Badge variant="light" color={m.role === 'owner' ? 'indigo' : 'gray'} data-testid="member-role-badge">{m.role === 'owner' ? 'Owner' : 'Member'}</Badge>
                      )}
                    </Table.Td>
                    <Table.Td><Text size="sm">{formatDate(m.joinedAt)}</Text></Table.Td>
                    <Table.Td>
                      <Group justify="flex-end" wrap="nowrap">
                        {self ? (
                          <Button
                            size="xs" variant="default" color="red" leftSection={<IconLogout size={14} />} onClick={() => askLeave(m)}
                            loading={removeMember.isPending && removeMember.variables === m.userId} data-testid="leave-team"
                          >
                            Leave team
                          </Button>
                        ) : (
                          isOwner && (
                            <Tooltip label="Remove from team" withArrow>
                              <ActionIcon
                                variant="subtle" color="red" aria-label={`Remove ${m.name}`} onClick={() => askRemove(m)}
                                loading={removeMember.isPending && removeMember.variables === m.userId} data-testid="remove-member"
                              >
                                <IconUserMinus size={16} />
                              </ActionIcon>
                            </Tooltip>
                          )
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Paper>
  )
}

function InviteSection({ teamId }: { teamId: string }) {
  const invite = useInvite(teamId)
  const revoke = useRevokeInvitation(teamId)
  const invitations = useTeamInvitations(teamId)
  const form = useForm({
    mode: 'controlled',
    initialValues: { email: '' },
    validate: { email: (v) => (EMAIL_RE.test(v.trim()) ? null : 'Enter a valid email address') },
  })

  const pending = invitations.data ?? []
  return (
    <Paper withBorder p="md">
      <Title order={4} mb={4}>Invite people</Title>
      <Text size="sm" c="dimmed" mb="sm">
        Invitees must sign up or sign in with the same email address you enter here, then accept the invitation (under Invitations in the top bar).
      </Text>
      <form
        noValidate
        onSubmit={form.onSubmit((v) => {
          const email = v.email.trim()
          invite.mutate(email, {
            onSuccess: (r) => {
              form.reset()
              if (r.emailSent) notifications.show({ color: 'green', message: `Invitation sent to ${email}` })
              else {
                notifications.show({
                  color: 'yellow', title: 'Invitation created, email not delivered',
                  message: `We could not send the email to ${email}, but the invitation exists. They will see it after signing in with that address.`,
                  autoClose: 10000,
                })
              }
            },
          })
        })}
      >
        <Group align="flex-start" gap="xs" wrap="wrap">
          <TextInput
            aria-label="Email address" placeholder="colleague@example.com" type="email" style={{ flex: '1 1 260px' }}
            leftSection={<IconMail size={16} />} data-testid="invite-email" {...form.getInputProps('email')}
          />
          <Button type="submit" leftSection={<IconSend size={14} />} loading={invite.isPending} data-testid="send-invitation">Send invitation</Button>
        </Group>
      </form>

      <Title order={5} mt="lg" mb="xs">Pending invitations</Title>
      {invitations.isPending && <Loader size="sm" />}
      {invitations.isError && <Alert color="red" title="Could not load invitations">{invitations.error.message}</Alert>}
      {invitations.isSuccess && pending.length === 0 && <Text size="sm" c="dimmed">No pending invitations.</Text>}
      {pending.length > 0 && (
        <Table.ScrollContainer minWidth={480}>
          <Table verticalSpacing="xs" data-testid="invitations-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Email</Table.Th>
                <Table.Th>Invited by</Table.Th>
                <Table.Th>Sent</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pending.map((inv) => (
                <Table.Tr key={inv.id} data-testid="invitation-row">
                  <Table.Td><Text size="sm">{inv.email}</Text></Table.Td>
                  <Table.Td><Text size="sm">{inv.invitedBy?.name ?? '-'}</Text></Table.Td>
                  <Table.Td><Text size="sm">{fromNow(inv.createdAt)}</Text></Table.Td>
                  <Table.Td>
                    <Group justify="flex-end">
                      <Button
                        size="xs" variant="default" color="red" data-testid="revoke-invitation"
                        loading={revoke.isPending && revoke.variables === inv.id}
                        onClick={() => revoke.mutate(inv.id, { onSuccess: () => notifications.show({ message: `Invitation for ${inv.email} revoked` }) })}
                      >
                        Revoke
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Paper>
  )
}

export function TeamSettingsPage() {
  const { teamId, team, isOwner, me } = useActiveTeam()
  if (!team) return <Group justify="center" py="xl"><Loader /></Group>
  return (
    <Box maw={900}>
      <PageHeader title="Team settings" description={`${team.name} · key ${team.key}`} />
      <Stack gap="lg">
        <TeamDetails key={`${team.name}|${team.key}`} teamId={teamId} name={team.name} teamKey={team.key} isOwner={isOwner} />
        <MembersSection teamId={teamId} isOwner={isOwner} myId={me?.user.id} />
        <InviteSection teamId={teamId} />
      </Stack>
    </Box>
  )
}
