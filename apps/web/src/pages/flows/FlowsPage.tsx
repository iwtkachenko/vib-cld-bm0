import { ActionIcon, Alert, Box, Button, Card, Group, Loader, Stack, Text, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowRight, IconFlag3, IconPencil, IconPlus, IconRoute, IconTrash } from '@tabler/icons-react'
import { Fragment } from 'react'
import { Link, useNavigate } from 'react-router'
import type { FlowDto } from '@pm/shared'
import { useDeleteFlow, useFlows, useFlowUsage } from '../../api/queries'
import { useTeamId } from '../../auth/hooks'
import { StatusBadge } from '../../components/common/badges'
import { confirmAction } from '../../components/common/confirm'
import { EmptyState } from '../../components/common/EmptyState'
import { PageHeader } from '../../components/common/PageHeader'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function FlowCard({ teamId, flow }: { teamId: string; flow: FlowDto }) {
  const navigate = useNavigate()
  const usage = useFlowUsage(teamId, flow.id)
  const remove = useDeleteFlow(teamId)
  const u = usage.data

  const askDelete = () => {
    const inUse = u && u.cardCount + u.projectCount + u.templateCount > 0
    confirmAction({
      title: `Delete flow "${flow.name}"?`,
      message: inUse
        ? `This flow is in use (${plural(u.cardCount, 'card')}, ${plural(u.projectCount, 'project')}, ${plural(u.templateCount, 'template')}), so the server will refuse to delete it. Remap the projects and templates to another flow first.`
        : 'This cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: () => remove.mutate(flow.id, { onSuccess: () => notifications.show({ message: `Flow "${flow.name}" deleted` }) }),
    })
  }

  return (
    <Card withBorder padding="sm" data-testid="flow-card">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Stack gap="xs" style={{ flex: '1 1 320px', minWidth: 0 }}>
          <Box>
            <Text fw={600} data-testid="flow-name">{flow.name}</Text>
            {flow.description && <Text size="sm" c="dimmed">{flow.description}</Text>}
          </Box>
          <Group gap={6} wrap="wrap" align="center">
            {flow.statuses.map((s, i) => (
              <Fragment key={s.id}>
                {i > 0 && <IconArrowRight size={14} color="var(--mantine-color-dimmed)" aria-hidden />}
                <Group gap={2} wrap="nowrap">
                  {s.id === flow.initialStatusId && (
                    <Tooltip label="Initial status" withArrow>
                      <IconFlag3 size={13} color="var(--mantine-color-dimmed)" aria-label="Initial status" />
                    </Tooltip>
                  )}
                  <StatusBadge status={s} />
                </Group>
              </Fragment>
            ))}
          </Group>
          <Text size="xs" c="dimmed" data-testid="flow-usage">
            {usage.isPending
              ? 'Loading usage...'
              : u
                ? `${plural(u.cardCount, 'card')} · ${plural(u.projectCount, 'project')}${u.templateCount > 0 ? ` · ${plural(u.templateCount, 'template')}` : ''}`
                : 'Usage unavailable'}
          </Text>
        </Stack>
        <Group gap={4} wrap="nowrap">
          <Button
            size="xs" variant="default" leftSection={<IconPencil size={14} />} data-testid="edit-flow"
            onClick={() => navigate(`/t/${teamId}/flows/${flow.id}`)}
          >
            Edit
          </Button>
          <Tooltip label="Delete" withArrow>
            <ActionIcon
              variant="default" c="red" size={30} aria-label={`Delete ${flow.name}`} data-testid="delete-flow"
              loading={remove.isPending} onClick={askDelete}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </Card>
  )
}

export function FlowsPage() {
  const teamId = useTeamId()
  const flows = useFlows(teamId)
  const list = flows.data ?? []

  const newFlowButton = (
    <Button component={Link} to={`/t/${teamId}/flows/new`} leftSection={<IconPlus size={16} />} data-testid="new-flow">
      New flow
    </Button>
  )

  return (
    <Box maw={900}>
      <PageHeader
        title="Flows"
        description="A flow is a set of statuses and the moves allowed between them. Projects map each card type to a flow."
        actions={newFlowButton}
      />
      {flows.isPending && <Group justify="center" py="xl"><Loader /></Group>}
      {flows.isError && <Alert color="red" title="Could not load flows">{flows.error.message}</Alert>}
      {flows.isSuccess && list.length === 0 && (
        <EmptyState icon={<IconRoute size={26} />} title="No flows yet" text="Create a flow, for example To Do - In Progress - Done." action={newFlowButton} />
      )}
      <Stack gap="sm">
        {list.map((f) => <FlowCard key={f.id} teamId={teamId} flow={f} />)}
      </Stack>
    </Box>
  )
}
