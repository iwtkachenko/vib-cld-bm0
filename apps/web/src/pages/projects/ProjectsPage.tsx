import { Alert, Anchor, Badge, Button, Card, Center, Group, Loader, Progress, SegmentedControl, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core'
import { IconAlertCircle, IconCalendar, IconLayoutKanban, IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { ProjectDto } from '@pm/shared'
import { useActiveTeam } from '../../auth/hooks'
import { useCardTypes, useFlows, useProjects, useTemplates } from '../../api/queries'
import { EmptyState } from '../../components/common/EmptyState'
import { PageHeader } from '../../components/common/PageHeader'
import { TypeBadge } from '../../components/common/badges'
import { useTeamLookups } from '../../components/common/lookups'
import { NewProjectWizard } from '../../components/projects/NewProjectWizard'
import { formatDate } from '../../utils/format'

type StateFilter = 'active' | 'archived'

export function ProjectsPage() {
  const { teamId } = useActiveTeam()
  const [state, setState] = useState<StateFilter>('active')
  const [wizard, setWizard] = useState<{ opened: boolean; templateId: string | null }>({ opened: false, templateId: null })
  const projects = useProjects(teamId, state)
  const templates = useTemplates(teamId)
  const cardTypes = useCardTypes(teamId)
  const flows = useFlows(teamId)
  const lookups = useTeamLookups(teamId)

  const quickTemplates = (templates.data ?? []).slice(0, 3)
  const openWizard = (templateId: string | null = null) => setWizard({ opened: true, templateId })
  const closeWizard = () => setWizard((w) => ({ ...w, opened: false }))
  const needsSetup = cardTypes.data?.length === 0 || flows.data?.length === 0

  return (
    <>
      <PageHeader
        title="Projects"
        description="Sprints, releases and backlogs. Each project decides which card types it accepts and which flow each type follows."
        actions={
          <>
            {quickTemplates.map((t) => (
              <Button key={t.id} variant="light" size="sm" data-testid="new-from-template" onClick={() => openWizard(t.id)}>
                New {t.name}
              </Button>
            ))}
            <Button leftSection={<IconPlus size={16} />} data-testid="new-project" onClick={() => openWizard()}>
              New project
            </Button>
          </>
        }
      />

      <SegmentedControl
        mb="md"
        value={state}
        onChange={(v) => setState(v as StateFilter)}
        data={[
          { value: 'active', label: 'Active' },
          { value: 'archived', label: 'Archived' },
        ]}
        data-testid="projects-state-filter"
      />

      {projects.isPending && <Center py="xl"><Loader /></Center>}
      {projects.isError && (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>{projects.error.message}</Alert>
      )}

      {projects.data && projects.data.length === 0 && (
        <EmptyState
          icon={<IconLayoutKanban />}
          title={state === 'active' ? 'No projects yet' : 'No archived projects'}
          text={
            state === 'active' ? (
              needsSetup ? (
                <>
                  Projects map card types to flows, so start by creating at least one{' '}
                  <Anchor component={Link} to={`/t/${teamId}/card-types`} size="sm">card type</Anchor> and one{' '}
                  <Anchor component={Link} to={`/t/${teamId}/flows`} size="sm">flow</Anchor>.
                </>
              ) : (
                'Create a project to start collecting cards, or begin from one of your templates.'
              )
            ) : (
              'Completed projects show up here. Complete a project from its settings.'
            )
          }
          action={
            state === 'active' ? (
              <Button leftSection={<IconPlus size={16} />} data-testid="empty-new-project" onClick={() => openWizard()}>
                New project
              </Button>
            ) : undefined
          }
        />
      )}

      {projects.data && projects.data.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" data-testid="project-grid">
          {projects.data.map((p) => (
            <ProjectCard key={p.id} project={p} teamId={teamId} typesById={lookups.typesById} flowsById={lookups.flowsById} />
          ))}
        </SimpleGrid>
      )}

      <NewProjectWizard opened={wizard.opened} onClose={closeWizard} initialTemplateId={wizard.templateId} />
    </>
  )
}

function ProjectCard({
  project, teamId, typesById, flowsById,
}: {
  project: ProjectDto
  teamId: string
  typesById: ReturnType<typeof useTeamLookups>['typesById']
  flowsById: ReturnType<typeof useTeamLookups>['flowsById']
}) {
  const total = project.counts?.total ?? 0
  const done = project.counts?.done ?? 0
  const pct = total ? Math.round((done / total) * 100) : 0
  const archived = project.state === 'archived'
  const dates =
    project.startDate || project.endDate
      ? `${project.startDate ? formatDate(project.startDate) : '…'} – ${project.endDate ? formatDate(project.endDate) : '…'}`
      : null

  return (
    <Card withBorder padding="md" data-testid="project-card" data-project-id={project.id}>
      <Stack gap="xs" h="100%">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
          <Anchor
            component={Link}
            to={`/t/${teamId}/projects/${project.id}/board`}
            fw={600}
            size="lg"
            c="inherit"
            style={{ overflowWrap: 'anywhere' }}
            data-testid="project-link"
          >
            {project.name}
          </Anchor>
          <Badge color={archived ? 'gray' : 'green'} variant="light" size="sm">{archived ? 'Archived' : 'Active'}</Badge>
        </Group>

        {project.description && <Text size="sm" c="dimmed" lineClamp={2}>{project.description}</Text>}

        {(dates || archived) && (
          <Group gap={6} wrap="nowrap">
            <IconCalendar size={14} style={{ flexShrink: 0 }} />
            <Text size="xs" c="dimmed">
              {dates}
              {archived && project.completedAt ? `${dates ? ' · ' : ''}completed ${formatDate(project.completedAt)}` : ''}
            </Text>
          </Group>
        )}

        <div>
          <Progress value={pct} size="sm" radius="xl" color={archived ? 'gray' : 'green'} aria-label={`${done} of ${total} cards done`} />
          <Text size="xs" c="dimmed" mt={4}>{total === 0 ? 'No cards yet' : `${done} of ${total} done`}</Text>
        </div>

        <Group gap={6} mt="auto">
          {project.typeFlows.map((tf) => (
            <Tooltip key={tf.cardTypeId} label={`Flow: ${flowsById.get(tf.flowId)?.name ?? 'unknown'}`} withArrow>
              <span>
                <TypeBadge type={typesById.get(tf.cardTypeId)} size="xs" />
              </span>
            </Tooltip>
          ))}
        </Group>
      </Stack>
    </Card>
  )
}
