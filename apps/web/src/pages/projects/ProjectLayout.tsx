import { Anchor, Badge, Button, Center, Group, Loader, Progress, Stack, Tabs, Text, Title } from '@mantine/core'
import { IconArrowLeft, IconCalendar } from '@tabler/icons-react'
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { ApiError } from '../../api/client'
import { useProject } from '../../api/queries'
import { useTeamId } from '../../auth/hooks'
import { EmptyState } from '../../components/common/EmptyState'
import { formatDate } from '../../utils/format'

const TABS = [
  { value: 'board', label: 'Board' },
  { value: 'list', label: 'List' },
  { value: 'stats', label: 'Stats' },
  { value: 'settings', label: 'Settings' },
] as const

/** Project header (name, state, dates, progress) and the Board / List / Stats / Settings tabs around the routed page. */
export function ProjectLayout() {
  const teamId = useTeamId()
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const project = useProject(teamId, projectId)

  const segments = pathname.split('/').filter(Boolean)
  const last = segments[segments.length - 1] ?? 'board'
  const tab = TABS.some((t) => t.value === last) ? last : 'board'
  const projectsPath = `/t/${teamId}/projects`

  // Keep showing cached data when a background refetch fails (e.g. right after the project was deleted, before navigation).
  if (!project.data && !project.isError) return <Center py="xl"><Loader /></Center>
  if (!project.data) {
    const notFound = project.error instanceof ApiError && project.error.status === 404
    return (
      <EmptyState
        title={notFound ? 'Project not found' : 'Could not load the project'}
        text={notFound ? 'It may have been deleted, or the link is wrong.' : project.error?.message}
        action={<Button component={Link} to={projectsPath} variant="light" leftSection={<IconArrowLeft size={16} />}>Back to projects</Button>}
      />
    )
  }

  const p = project.data
  const total = p.counts?.total ?? 0
  const done = p.counts?.done ?? 0
  const pct = total ? Math.round((done / total) * 100) : 0
  const archived = p.state === 'archived'
  const dates =
    p.startDate || p.endDate
      ? `${p.startDate ? formatDate(p.startDate) : '…'} – ${p.endDate ? formatDate(p.endDate) : '…'}`
      : null

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Anchor component={Link} to={projectsPath} size="sm" c="dimmed" data-testid="back-to-projects">
          <Group gap={4} wrap="nowrap" display="inline-flex">
            <IconArrowLeft size={14} />
            Projects
          </Group>
        </Anchor>
        <Group gap="sm" align="center" wrap="wrap">
          <Title order={2} style={{ overflowWrap: 'anywhere' }} data-testid="project-name">{p.name}</Title>
          <Badge color={archived ? 'gray' : 'green'} variant="light" data-testid="project-state">
            {archived ? `Archived${p.completedAt ? ` · ${formatDate(p.completedAt)}` : ''}` : 'Active'}
          </Badge>
        </Group>
        <Group gap="md" wrap="wrap">
          {dates && (
            <Group gap={6} wrap="nowrap">
              <IconCalendar size={14} />
              <Text size="sm" c="dimmed">{dates}</Text>
            </Group>
          )}
          <Group gap="xs" wrap="nowrap">
            <Progress value={pct} w={120} size="sm" radius="xl" color={archived ? 'gray' : 'green'} aria-label="Project progress" />
            <Text size="sm" c="dimmed" data-testid="project-progress">{total === 0 ? 'No cards yet' : `${done} of ${total} done`}</Text>
          </Group>
        </Group>
      </Stack>

      <Tabs value={tab} onChange={(v) => v && navigate(`${projectsPath}/${p.id}/${v}`)} keepMounted={false}>
        <Tabs.List style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
          {TABS.map((t) => (
            <Tabs.Tab key={t.value} value={t.value} data-testid={`tab-${t.value}`}>{t.label}</Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      <Outlet />
    </Stack>
  )
}
