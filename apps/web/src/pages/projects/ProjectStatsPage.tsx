import { Alert, Box, Button, Card, Center, Group, Loader, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { AreaChart, BarChart } from '@mantine/charts'
import { IconAlertCircle, IconChartBar, IconInfoCircle } from '@tabler/icons-react'
import dayjs from 'dayjs'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { buildBurnup, dayInZone, todayString } from '@pm/shared'
import type { ProjectDto, ProjectStatsDto } from '@pm/shared'
import { useProject, useProjectStats } from '../../api/queries'
import { useTeamId } from '../../auth/hooks'
import { EmptyState } from '../../components/common/EmptyState'
import { STATUS_CATEGORY_COLOR } from '../../utils/colors'
import { formatDateTime } from '../../utils/format'

/** Quiet, solid hairlines: dashed grids read as thresholds. */
const CHART_COMMON = {
  gridAxis: 'y' as const,
  tickLine: 'none' as const,
  strokeDasharray: 'none',
  withLegend: false,
}
const DONE_COLOR = 'green.6'
const OPEN_COLOR = 'gray.5'
const SCOPE_COLOR = 'blue.6'

/** Mantine color names from flows ('blue') become explicit shades so the chart reads the same in both color schemes. */
const shade = (color: string) => (/^[a-z]+$/.test(color) ? `${color}.6` : color)

export function ProjectStatsPage() {
  const teamId = useTeamId()
  const { projectId } = useParams()
  const projectQ = useProject(teamId, projectId)
  const statsQ = useProjectStats(teamId, projectId)

  if (!projectQ.data || !statsQ.data) {
    if (!projectQ.isError && !statsQ.isError) return <Center py="xl"><Loader /></Center>
    return (
      <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>
        {projectQ.error?.message ?? statsQ.error?.message ?? 'Could not load the statistics.'}
      </Alert>
    )
  }
  return <StatsView project={projectQ.data} stats={statsQ.data} backTo={`/t/${teamId}/projects/${projectQ.data.id}/board`} />
}

function StatsView({ project, stats, backTo }: { project: ProjectDto; stats: ProjectStatsDto; backTo: string }) {
  const archived = project.state === 'archived'
  const burnup = useMemo(() => computeBurnup(project, stats), [project, stats])

  if (stats.total === 0) {
    return (
      <EmptyState
        icon={<IconChartBar />}
        title="No statistics yet"
        text={archived ? 'This project had no cards when it was completed.' : 'Charts appear as soon as the project has cards.'}
        action={archived ? undefined : <Button component={Link} to={backTo} variant="light">Go to the board</Button>}
      />
    )
  }

  const typeRows = stats.byType.map((t) => ({ name: t.name, done: t.done, open: t.total - t.done }))
  const assigneeRows = stats.byAssignee.map((a) => ({ name: a.name, done: a.done, open: a.total - a.done }))
  const doneOpenSeries = [
    { name: 'done', label: 'Done', color: DONE_COLOR },
    { name: 'open', label: 'Open', color: OPEN_COLOR },
  ]
  const stackGap = { stroke: 'var(--mantine-color-body)', strokeWidth: 2 }

  return (
    <Stack gap="lg" data-testid="project-stats">
      {archived && (
        <Alert color="gray" variant="light" icon={<IconInfoCircle size={16} />} data-testid="stats-as-of">
          Figures as of {formatDateTime(stats.asOf)}, when the project was completed. Cards carried over to other projects no longer count here.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="sm">
        <Kpi label="Total" value={stats.total} testId="kpi-total" />
        <Kpi label="To do" value={stats.todo} dot={STATUS_CATEGORY_COLOR.todo} testId="kpi-todo" />
        <Kpi label="In progress" value={stats.inProgress} dot={STATUS_CATEGORY_COLOR.in_progress} testId="kpi-in-progress" />
        <Kpi label="Done" value={stats.done} dot={STATUS_CATEGORY_COLOR.done} testId="kpi-done" />
        <Kpi label="Completion" value={`${stats.completionPct}%`} testId="kpi-completion" />
      </SimpleGrid>

      <Card withBorder padding="md" data-testid="chart-burnup">
        <Title order={5}>Burn-up</Title>
        <Text size="xs" c="dimmed" mb="sm">Cards in scope versus cards completed, per day.</Text>
        {burnup.points.length === 0 ? (
          <Text size="sm" c="dimmed">{burnup.note}</Text>
        ) : (
          <AreaChart
            h={260}
            data={burnup.points}
            dataKey="date"
            series={[
              { name: 'scope', label: 'Scope', color: SCOPE_COLOR },
              { name: 'done', label: 'Done', color: DONE_COLOR },
            ]}
            curveType="linear"
            withDots={burnup.points.length <= 2}
            fillOpacity={0.12}
            gridAxis="y"
            tickLine="none"
            strokeDasharray="none"
            withLegend
            legendProps={{ verticalAlign: 'bottom', height: 36 }}
            xAxisProps={{ tickFormatter: (v: string) => dayjs(v).format('MMM D'), minTickGap: 32 }}
            yAxisProps={{ allowDecimals: false, domain: [0, 'auto'] }}
          />
        )}
        {burnup.points.length > 0 && burnup.note && <Text size="xs" c="dimmed" mt="xs">{burnup.note}</Text>}
      </Card>

      <div>
        <Title order={4} mb="xs">Status distribution</Title>
        <SimpleGrid cols={{ base: 1, md: stats.byStatus.length > 1 ? 2 : 1 }} spacing="md">
          {stats.byStatus.map((flow) => (
            <Card key={flow.flowId} withBorder padding="md" data-testid="chart-status">
              <Title order={5}>{flow.flowName}</Title>
              <Text size="xs" c="dimmed" mb="sm">Cards by their current status in this flow.</Text>
              <BarChart
                h={260}
                {...CHART_COMMON}
                data={flow.statuses.map((s) => ({ status: s.name, [`s-${s.statusId}`]: s.count }))}
                dataKey="status"
                type="stacked"
                series={flow.statuses.map((s) => ({ name: `s-${s.statusId}`, label: s.name, color: shade(s.color || STATUS_CATEGORY_COLOR[s.category]) }))}
                maxBarWidth={44}
                yAxisProps={{ allowDecimals: false }}
                xAxisProps={{ interval: 0, tick: { fontSize: 11 } }}
              />
            </Card>
          ))}
        </SimpleGrid>
      </div>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder padding="md" data-testid="chart-type">
          <Title order={5}>By card type</Title>
          <Text size="xs" c="dimmed" mb="sm">Done versus still open.</Text>
          <BarChart
            h={Math.max(260, typeRows.length * 40 + 80)}
            {...CHART_COMMON}
            gridAxis="x"
            withLegend
            legendProps={{ verticalAlign: 'bottom', height: 36 }}
            data={typeRows}
            dataKey="name"
            orientation="vertical"
            type="stacked"
            series={doneOpenSeries}
            barProps={stackGap}
            maxBarWidth={28}
            yAxisProps={{ width: 100 }}
            xAxisProps={{ allowDecimals: false }}
          />
        </Card>
        <Card withBorder padding="md" data-testid="chart-assignee">
          <Title order={5}>By assignee</Title>
          <Text size="xs" c="dimmed" mb="sm">Cards with several assignees count for each of them.</Text>
          <BarChart
            h={Math.max(260, assigneeRows.length * 40 + 80)}
            {...CHART_COMMON}
            gridAxis="x"
            withLegend
            legendProps={{ verticalAlign: 'bottom', height: 36 }}
            data={assigneeRows}
            dataKey="name"
            orientation="vertical"
            type="stacked"
            series={doneOpenSeries}
            barProps={stackGap}
            maxBarWidth={28}
            yAxisProps={{ width: 100 }}
            xAxisProps={{ allowDecimals: false }}
          />
        </Card>
      </SimpleGrid>
    </Stack>
  )
}

function Kpi({ label, value, dot, testId }: { label: string; value: number | string; dot?: string; testId: string }) {
  return (
    <Paper withBorder p="md" data-testid={testId}>
      <Group gap={6} wrap="nowrap">
        {dot && <Box w={8} h={8} bg={`${dot}.6`} style={{ borderRadius: 2, flexShrink: 0 }} />}
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      </Group>
      <Text fz={28} fw={700} lh={1.2} mt={4}>{value}</Text>
    </Paper>
  )
}

function computeBurnup(project: ProjectDto, stats: ProjectStatsDto): { points: ReturnType<typeof buildBurnup>; note: string } {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const firstAdded = stats.timeline.map((t) => t.addedAt).sort()[0]
  const from = project.startDate ?? (firstAdded ? dayInZone(new Date(firstAdded), timeZone) : null)
  if (!from) return { points: [], note: 'The burn-up chart appears once the project has cards.' }
  const today = todayString(timeZone)
  let to = project.endDate ?? today
  if (to > today) to = today
  if (project.state === 'archived') {
    const completedDay = dayInZone(new Date(stats.asOf), timeZone)
    if (completedDay < to) to = completedDay
  }
  if (to < from) return { points: [], note: `The burn-up chart starts on ${dayjs(from).format('MMM D, YYYY')}, when the project begins.` }
  const points = buildBurnup(stats.timeline, from, to, timeZone)
  const truncated = dayjs(to).diff(dayjs(from), 'day') > 365
  return { points, note: truncated ? 'Showing the most recent 366 days.' : '' }
}
