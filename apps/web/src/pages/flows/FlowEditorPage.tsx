import {
  ActionIcon, Alert, Box, Button, Checkbox, ColorSwatch, Group, Loader, Paper, Radio, Select, Stack, Table, Text, Textarea, TextInput, Title, Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowDown, IconArrowLeft, IconArrowUp, IconPlus, IconRoute, IconTrash } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { allTransitions, flowInput, linearTransitions, newShortId, STATUS_CATEGORIES, validateFlowDef } from '@pm/shared'
import type { FlowDto, StatusCategory, StatusDef, Transition } from '@pm/shared'
import { useFlows, useFlowUsage, useSaveFlow } from '../../api/queries'
import { useTeamId } from '../../auth/hooks'
import { EmptyState } from '../../components/common/EmptyState'
import { PageHeader } from '../../components/common/PageHeader'
import { COLOR_NAMES, STATUS_CATEGORY_COLOR, STATUS_CATEGORY_LABEL } from '../../utils/colors'

const MAX_STATUSES = 20
const CATEGORY_OPTIONS = STATUS_CATEGORIES.map((c) => ({ value: c, label: STATUS_CATEGORY_LABEL[c] }))
const COLOR_OPTIONS = COLOR_NAMES.map((c) => ({ value: c, label: c }))
/** Keeps a color that is not in the palette selectable so editing a status never silently recolors it. */
const colorOptions = (current: string) => (current && !(COLOR_NAMES as readonly string[]).includes(current) ? [...COLOR_OPTIONS, { value: current, label: current }] : COLOR_OPTIONS)

interface Draft {
  name: string
  description: string
  statuses: StatusDef[]
  initialStatusId: string
  transitions: Transition[]
}

function defaultDraft(): Draft {
  const statuses: StatusDef[] = [
    { id: newShortId(), name: 'To Do', category: 'todo', color: 'gray' },
    { id: newShortId(), name: 'In Progress', category: 'in_progress', color: 'blue' },
    { id: newShortId(), name: 'Done', category: 'done', color: 'green' },
  ]
  return { name: '', description: '', statuses, initialStatusId: statuses[0]!.id, transitions: allTransitions(statuses) }
}

const draftOf = (f: FlowDto): Draft => ({
  name: f.name,
  description: f.description,
  statuses: f.statuses.map((s) => ({ ...s })),
  initialStatusId: f.initialStatusId,
  transitions: f.transitions.map((t) => ({ ...t })),
})

interface Issue { path: PropertyKey[]; message: string; code: string }

function describeIssue(issue: Issue, d: Draft): string {
  const [head, idx, leaf] = issue.path
  const tooSmall = issue.code === 'too_small'
  const tooBig = issue.code === 'too_big'
  if (head === 'name') return tooSmall ? 'Flow name is required' : tooBig ? 'Flow name is too long (max 60 characters)' : issue.message
  if (head === 'description' && tooBig) return 'Description is too long (max 500 characters)'
  if (head === 'statuses' && typeof idx === 'number') {
    const name = d.statuses[idx]?.name.trim()
    const label = name ? `Status "${name}"` : `Status ${idx + 1}`
    if (leaf === 'name') return `${label}: ${tooSmall ? 'name is required' : tooBig ? 'name is too long (max 40 characters)' : issue.message}`
    return `${label}: ${issue.message}`
  }
  if (head === 'statuses') return tooBig ? `A flow can have at most ${MAX_STATUSES} statuses` : tooSmall ? 'A flow needs at least one status' : issue.message
  return issue.message
}

function FlowEditor({ teamId, flow }: { teamId: string; flow: FlowDto | undefined }) {
  const navigate = useNavigate()
  const save = useSaveFlow(teamId)
  const usage = useFlowUsage(teamId, flow?.id)
  const [draft, setDraft] = useState<Draft>(() => (flow ? draftOf(flow) : defaultDraft()))
  const [attempted, setAttempted] = useState(false)
  const { statuses, transitions, initialStatusId } = draft

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const updateStatus = (i: number, p: Partial<StatusDef>) => patch({ statuses: statuses.map((s, idx) => (idx === i ? { ...s, ...p } : s)) })

  const addStatus = () => {
    let n = statuses.length + 1
    while (statuses.some((s) => s.name.trim().toLowerCase() === `status ${n}`)) n++
    const added: StatusDef = { id: newShortId(), name: `Status ${n}`, category: 'in_progress', color: 'gray' }
    const links: Transition[] = statuses.flatMap((s) => [{ from: s.id, to: added.id }, { from: added.id, to: s.id }])
    patch({ statuses: [...statuses, added], transitions: [...transitions, ...links] })
  }

  const removeStatus = (i: number) => {
    const gone = statuses[i]!
    const rest = statuses.filter((_, idx) => idx !== i)
    patch({
      statuses: rest,
      transitions: transitions.filter((t) => t.from !== gone.id && t.to !== gone.id),
      initialStatusId: gone.id === initialStatusId ? (rest[0]?.id ?? '') : initialStatusId,
    })
  }

  const moveStatus = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= statuses.length) return
    const next = [...statuses]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    patch({ statuses: next })
  }

  const transitionSet = useMemo(() => new Set(transitions.map((t) => `${t.from}>${t.to}`)), [transitions])
  const setTransition = (from: string, to: string, on: boolean) =>
    patch({ transitions: on ? [...transitions, { from, to }] : transitions.filter((t) => !(t.from === from && t.to === to)) })

  const body = { name: draft.name, description: draft.description, statuses, initialStatusId, transitions }
  const structural = validateFlowDef({ statuses, initialStatusId, transitions })
  const parsed = flowInput.safeParse(body)
  const issues = attempted
    ? [...new Set(parsed.success ? structural : [...parsed.error.issues.map((i) => describeIssue(i, draft)), ...structural])]
    : structural

  const submit = () => {
    setAttempted(true)
    if (!parsed.success) return
    save.mutate(
      { id: flow?.id, body: parsed.data },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', message: flow ? `Flow "${parsed.data.name}" saved` : `Flow "${parsed.data.name}" created` })
          navigate(`/t/${teamId}/flows`)
        },
      },
    )
  }

  const cardsIn = (statusId: string) => usage.data?.byStatus[statusId] ?? 0
  const u = usage.data

  return (
    <Box maw={900}>
      <PageHeader
        title={flow ? 'Edit flow' : 'New flow'}
        description="Statuses are shown as board columns in the order listed here."
        actions={
          <Button component={Link} to={`/t/${teamId}/flows`} variant="default" leftSection={<IconArrowLeft size={14} />}>
            All flows
          </Button>
        }
      />
      <form onSubmit={(e) => { e.preventDefault(); submit() }} noValidate>
        <Stack gap="lg">
          <Paper withBorder p="md">
            <Stack gap="sm">
              <TextInput
                label="Name" placeholder="Software delivery" required data-autofocus data-testid="flow-name-input"
                value={draft.name} onChange={(e) => patch({ name: e.currentTarget.value })}
                error={attempted && !draft.name.trim() ? 'Name is required' : undefined}
              />
              <Textarea
                label="Description" autosize minRows={2} maxRows={5} data-testid="flow-description-input"
                value={draft.description} onChange={(e) => patch({ description: e.currentTarget.value })}
              />
            </Stack>
          </Paper>

          {flow && (
            <Paper withBorder p="md" data-testid="flow-usage-panel">
              <Title order={5} mb="xs">Usage</Title>
              {usage.isPending && <Loader size="xs" />}
              {u && (
                <Stack gap={4}>
                  <Text size="sm">
                    Used by {u.cardCount} {u.cardCount === 1 ? 'card' : 'cards'}, {u.projectCount} {u.projectCount === 1 ? 'project' : 'projects'} and{' '}
                    {u.templateCount} {u.templateCount === 1 ? 'template' : 'templates'}.
                  </Text>
                  <Text size="xs" c="dimmed">
                    A status that has cards cannot be removed. Changing a status category also updates the cards that are in it (moving them into or out of
                    "done" sets or clears their completion date).
                  </Text>
                </Stack>
              )}
            </Paper>
          )}

          <Paper withBorder p="md">
            <Group justify="space-between" mb="sm" wrap="wrap">
              <Box>
                <Title order={5}>Statuses</Title>
                <Text size="xs" c="dimmed">The initial status is where new cards start. At least one status must be in the "Done" category.</Text>
              </Box>
              <Button
                size="xs" variant="light" leftSection={<IconPlus size={14} />} disabled={statuses.length >= MAX_STATUSES}
                onClick={addStatus} data-testid="add-status"
              >
                Add status
              </Button>
            </Group>
            <Radio.Group value={initialStatusId} onChange={(v) => patch({ initialStatusId: v })}>
              <Stack gap="xs">
                {statuses.map((s, i) => {
                  const n = cardsIn(s.id)
                  const lastOne = statuses.length <= 1
                  const removeBlocked = lastOne || n > 0
                  const removeReason = lastOne ? 'A flow needs at least one status' : `${n} ${n === 1 ? 'card is' : 'cards are'} in this status - move them elsewhere first`
                  return (
                    <Paper key={s.id} withBorder p="xs" data-testid="status-row">
                      <Group gap="xs" wrap="wrap" align="flex-end">
                        <TextInput
                          label={i === 0 ? 'Name' : undefined} aria-label="Status name" placeholder="Status name" style={{ flex: '1 1 150px' }}
                          value={s.name} data-testid="status-name" onChange={(e) => updateStatus(i, { name: e.currentTarget.value })}
                        />
                        <Select
                          label={i === 0 ? 'Category' : undefined} aria-label="Status category" w={140} data={CATEGORY_OPTIONS} value={s.category}
                          allowDeselect={false} data-testid="status-category"
                          onChange={(c) => c && updateStatus(i, { category: c as StatusCategory })}
                        />
                        <Select
                          label={i === 0 ? 'Color' : undefined} aria-label="Status color" w={130} data={colorOptions(s.color)} value={s.color || STATUS_CATEGORY_COLOR[s.category]}
                          allowDeselect={false} data-testid="status-color"
                          leftSection={<ColorSwatch size={14} color={`var(--mantine-color-${s.color || STATUS_CATEGORY_COLOR[s.category]}-6)`} />}
                          renderOption={({ option }) => (
                            <Group gap="xs" wrap="nowrap">
                              <ColorSwatch size={14} color={`var(--mantine-color-${option.value}-6)`} />
                              <span>{option.label}</span>
                            </Group>
                          )}
                          onChange={(c) => c && updateStatus(i, { color: c })}
                        />
                        <Radio value={s.id} label="Initial" aria-label={`Initial status: ${s.name || i + 1}`} data-testid="status-initial" mb={8} />
                        <Group gap={2} wrap="nowrap">
                          <ActionIcon variant="subtle" color="gray" aria-label={`Move ${s.name || 'status'} up`} disabled={i === 0} onClick={() => moveStatus(i, -1)} data-testid="status-up">
                            <IconArrowUp size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle" color="gray" aria-label={`Move ${s.name || 'status'} down`} disabled={i === statuses.length - 1}
                            onClick={() => moveStatus(i, 1)} data-testid="status-down"
                          >
                            <IconArrowDown size={16} />
                          </ActionIcon>
                          <Tooltip label={removeReason} disabled={!removeBlocked} withArrow multiline maw={240}>
                            <Box component="span" style={{ display: 'inline-flex' }}>
                              <ActionIcon
                                variant="subtle" color="red" aria-label={`Remove ${s.name || 'status'}`} disabled={removeBlocked}
                                onClick={() => removeStatus(i)} data-testid="status-remove"
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Box>
                          </Tooltip>
                        </Group>
                      </Group>
                      {flow && n > 0 && <Text size="xs" c="dimmed" mt={4}>{n} {n === 1 ? 'card' : 'cards'} in this status</Text>}
                    </Paper>
                  )
                })}
              </Stack>
            </Radio.Group>
          </Paper>

          <Paper withBorder p="md">
            <Group justify="space-between" mb="sm" wrap="wrap">
              <Box>
                <Title order={5}>Transitions</Title>
                <Text size="xs" c="dimmed">Tick the moves a card is allowed to make: from a status (row) to another status (column).</Text>
              </Box>
              <Group gap="xs">
                <Button size="xs" variant="default" onClick={() => patch({ transitions: allTransitions(statuses) })} data-testid="preset-all">All</Button>
                <Button size="xs" variant="default" onClick={() => patch({ transitions: linearTransitions(statuses) })} data-testid="preset-linear">Linear</Button>
                <Button size="xs" variant="default" onClick={() => patch({ transitions: [] })} data-testid="preset-clear">Clear</Button>
              </Group>
            </Group>
            <Box style={{ overflowX: 'auto' }} data-testid="transition-matrix">
              <Table miw={140 + statuses.length * 92} withTableBorder withColumnBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ position: 'sticky', left: 0, background: 'var(--mantine-color-body)', zIndex: 1 }}>From \ To</Table.Th>
                    {statuses.map((s) => (
                      <Table.Th key={s.id} ta="center">
                        <Text size="xs" fw={600} truncate maw={84} mx="auto" title={s.name}>{s.name || '(unnamed)'}</Text>
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {statuses.map((from, i) => (
                    <Table.Tr key={from.id}>
                      <Table.Th scope="row" style={{ position: 'sticky', left: 0, background: 'var(--mantine-color-body)', zIndex: 1 }}>
                        <Text size="xs" fw={600} truncate maw={120} title={from.name}>{from.name || '(unnamed)'}</Text>
                      </Table.Th>
                      {statuses.map((to, j) => (
                        <Table.Td key={to.id} ta="center">
                          {from.id === to.id ? (
                            <Text size="xs" c="dimmed" aria-hidden>-</Text>
                          ) : (
                            <Group justify="center">
                              <Checkbox
                                aria-label={`Allow ${from.name || i + 1} to ${to.name || j + 1}`} data-testid={`transition-${i}-${j}`}
                                checked={transitionSet.has(`${from.id}>${to.id}`)}
                                onChange={(e) => setTransition(from.id, to.id, e.currentTarget.checked)}
                              />
                            </Group>
                          )}
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
          </Paper>

          {issues.length > 0 && (
            <Alert color={attempted ? 'red' : 'yellow'} variant="light" title="Fix these before saving" data-testid="flow-issues">
              <Stack gap={2}>
                {issues.map((m) => <Text key={m} size="sm">{m}</Text>)}
              </Stack>
            </Alert>
          )}

          <Group justify="flex-end">
            <Button component={Link} to={`/t/${teamId}/flows`} variant="default">Cancel</Button>
            <Button type="submit" loading={save.isPending} data-testid="save-flow">{flow ? 'Save changes' : 'Create flow'}</Button>
          </Group>
        </Stack>
      </form>
    </Box>
  )
}

export function FlowEditorPage() {
  const teamId = useTeamId()
  const { flowId } = useParams()
  const flows = useFlows(teamId)
  const isNew = flowId === 'new'
  const existing = isNew ? undefined : flows.data?.find((f) => f.id === flowId)

  if (!isNew && flows.isPending) return <Group justify="center" py="xl"><Loader /></Group>
  if (!isNew && !existing) {
    return (
      <EmptyState
        icon={<IconRoute size={26} />} title="Flow not found" text="It may have been deleted."
        action={<Button component={Link} to={`/t/${teamId}/flows`} variant="default">Back to flows</Button>}
      />
    )
  }
  return <FlowEditor key={existing?.id ?? 'new'} teamId={teamId} flow={existing} />
}
