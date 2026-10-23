import {
  Alert, Anchor, Button, Card, Center, Checkbox, Group, Loader, Modal, NumberInput, Select, SimpleGrid, Stack, Text, TextInput, Textarea, Title,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle, IconArchive, IconArchiveOff, IconTemplate, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { daysBetween } from '@pm/shared'
import type { ProjectDto, TypeFlow, UpdateProjectBody } from '@pm/shared'
import { ApiError } from '../../api/client'
import {
  useCardTypes, useCards, useCompleteProject, useDeleteProject, useFlows, useProject, useProjects, useReopenProject, useSaveAsTemplate,
  useUpdateProject,
} from '../../api/queries'
import { useTeamId } from '../../auth/hooks'
import { confirmAction } from '../../components/common/confirm'
import { TypeFlowEditor } from '../../components/projects/TypeFlowEditor'
import { formatDate } from '../../utils/format'

const sameMapping = (a: TypeFlow[], b: TypeFlow[]) =>
  a.length === b.length && a.every((x) => b.some((y) => y.cardTypeId === x.cardTypeId && y.flowId === x.flowId))

export function ProjectSettingsPage() {
  const teamId = useTeamId()
  const { projectId } = useParams()
  const projectQ = useProject(teamId, projectId)
  if (!projectQ.data) {
    if (projectQ.isError) return <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>{projectQ.error.message}</Alert>
    return <Center py="xl"><Loader /></Center>
  }
  return <SettingsView project={projectQ.data} teamId={teamId} />
}

function SettingsView({ project, teamId }: { project: ProjectDto; teamId: string }) {
  const archived = project.state === 'archived'
  const typesQ = useCardTypes(teamId)
  const flowsQ = useFlows(teamId)
  const cardsQ = useCards(teamId, { projectId: project.id, limit: 1000 })
  const update = useUpdateProject(teamId)
  const reopen = useReopenProject(teamId)
  const del = useDeleteProject(teamId)
  const navigate = useNavigate()

  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [startDate, setStartDate] = useState<string | null>(project.startDate)
  const [endDate, setEndDate] = useState<string | null>(project.endDate)
  const [typeFlows, setTypeFlows] = useState<TypeFlow[]>(project.typeFlows)
  const [showErrors, setShowErrors] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)

  const primaryCards = (cardsQ.data ?? []).filter((c) => c.primaryProjectId === project.id)
  const unfinished = primaryCards.filter((c) => c.statusCategory !== 'done')
  const lockedTypeIds = new Set(primaryCards.map((c) => c.typeId))

  const mappingChanged = !archived && !sameMapping(typeFlows, project.typeFlows)
  const changed =
    name.trim() !== project.name || description.trim() !== project.description || startDate !== project.startDate || endDate !== project.endDate || mappingChanged
  const errors = {
    name: name.trim() ? null : 'Name is required',
    dates: startDate && endDate && endDate < startDate ? 'End date is before the start date' : null,
    mapping: !archived && typeFlows.length === 0 ? 'Map at least one card type to a flow' : null,
  }

  async function save() {
    if (errors.name || errors.dates || errors.mapping) {
      setShowErrors(true)
      return
    }
    const body: UpdateProjectBody = {}
    if (name.trim() !== project.name) body.name = name.trim()
    if (description.trim() !== project.description) body.description = description.trim()
    if (startDate !== project.startDate) body.startDate = startDate
    if (endDate !== project.endDate) body.endDate = endDate
    if (mappingChanged) body.typeFlows = typeFlows
    const remapped = mappingChanged
      ? new Set(project.typeFlows.filter((o) => typeFlows.some((n) => n.cardTypeId === o.cardTypeId && n.flowId !== o.flowId)).map((o) => o.cardTypeId))
      : new Set<string>()
    const affected = primaryCards.filter((c) => remapped.has(c.typeId)).length
    const saved = await update.mutateAsync({ id: project.id, body })
    setName(saved.name)
    setDescription(saved.description)
    setStartDate(saved.startDate)
    setEndDate(saved.endDate)
    setTypeFlows(saved.typeFlows)
    setShowErrors(false)
    notifications.show({
      color: 'green',
      title: 'Project saved',
      message: affected > 0 ? `${affected} card${affected === 1 ? ' was' : 's were'} moved to the statuses of the new flow.` : 'Your changes were saved.',
    })
  }

  function confirmDelete() {
    confirmAction({
      title: 'Delete project',
      message: (
        <>
          Delete “{project.name}”? Cards linked to it stay in their other projects. Projects that still have cards as their primary project cannot
          be deleted: complete (archive) the project instead.
        </>
      ),
      confirmLabel: 'Delete project',
      onConfirm: () =>
        del.mutate(project.id, {
          onSuccess: () => {
            notifications.show({ color: 'green', message: `“${project.name}” was deleted` })
            navigate(`/t/${teamId}/projects`)
          },
          onError: (e) => {
            if (e instanceof ApiError && e.status === 409) {
              notifications.show({
                color: 'yellow',
                title: 'Complete the project instead',
                message: 'Completing archives the project together with its cards and statistics, and can carry unfinished cards over to another project.',
                autoClose: 10000,
              })
            }
          },
        }),
    })
  }

  return (
    <Stack gap="lg" maw={860} data-testid="project-settings">
      <Card withBorder padding="md">
        <Stack gap="sm">
          <Title order={4}>General</Title>
          <TextInput
            label="Name"
            required
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.currentTarget.value)}
            error={showErrors ? errors.name : null}
            data-testid="settings-name"
          />
          <Textarea
            label="Description"
            autosize
            minRows={2}
            maxRows={6}
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.currentTarget.value)}
            data-testid="settings-description"
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <DatePickerInput
              label="Start date"
              placeholder="Pick a date"
              clearable
              valueFormat="MMM D, YYYY"
              value={startDate}
              onChange={setStartDate}
              data-testid="settings-start-date"
            />
            <DatePickerInput
              label="End date"
              placeholder="Pick a date"
              clearable
              valueFormat="MMM D, YYYY"
              minDate={startDate ?? undefined}
              value={endDate}
              onChange={setEndDate}
              error={showErrors ? errors.dates : null}
              data-testid="settings-end-date"
            />
          </SimpleGrid>

          <div>
            <Text size="sm" fw={500}>Card types and flows</Text>
            {archived ? (
              <Alert color="gray" variant="light" mt="xs" mb="xs">Reopen to change card types.</Alert>
            ) : (
              <Text size="xs" c="dimmed" mb="xs">
                Card types that still have cards with this project as primary cannot be removed. Changing the flow of a type remaps the statuses of its
                cards automatically: the same status is kept when the new flow has it, otherwise the first status of the same category, otherwise the
                initial status.
              </Text>
            )}
            <TypeFlowEditor
              value={typeFlows}
              onChange={setTypeFlows}
              types={typesQ.data ?? []}
              flows={flowsQ.data ?? []}
              lockedTypeIds={lockedTypeIds}
              disabled={archived}
            />
            {showErrors && errors.mapping && <Text size="xs" c="red" mt={4}>{errors.mapping}</Text>}
          </div>

          <Group justify="flex-end">
            <Button onClick={() => void save()} loading={update.isPending} disabled={!changed} data-testid="settings-save">Save changes</Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder padding="md" data-testid="lifecycle-zone" style={{ borderColor: 'var(--mantine-color-red-outline)' }}>
        <Title order={4} mb="sm">Lifecycle</Title>
        <Stack gap="md">
          {archived ? (
            <ZoneRow
              title="Reopen project"
              text={`Completed ${formatDate(project.completedAt)}. Reopening makes the project active again: cards can be added and card types changed.`}
            >
              <Button
                variant="light"
                leftSection={<IconArchiveOff size={16} />}
                loading={reopen.isPending}
                data-testid="reopen-project"
                onClick={() => reopen.mutate(project.id, { onSuccess: () => notifications.show({ color: 'green', message: `“${project.name}” is active again` }) })}
              >
                Reopen
              </Button>
            </ZoneRow>
          ) : (
            <ZoneRow title="Complete project" text="Archives the project and freezes its statistics. Unfinished cards can be carried over to another project.">
              <Button color="orange" variant="light" leftSection={<IconArchive size={16} />} data-testid="complete-project" onClick={() => setCompleteOpen(true)}>
                Complete project
              </Button>
            </ZoneRow>
          )}
          <ZoneRow title="Save as template" text="Keep this project's card types, flows and optionally its cards as a blueprint for future projects.">
            <Button variant="light" leftSection={<IconTemplate size={16} />} data-testid="save-as-template" onClick={() => setTemplateOpen(true)}>
              Save as template
            </Button>
          </ZoneRow>
          <ZoneRow title="Delete project" text="Only possible when no card has this project as its primary project. Otherwise complete the project instead.">
            <Button color="red" variant="outline" leftSection={<IconTrash size={16} />} loading={del.isPending} data-testid="delete-project" onClick={confirmDelete}>
              Delete project
            </Button>
          </ZoneRow>
        </Stack>
      </Card>

      {completeOpen && (
        <CompleteModal project={project} teamId={teamId} unfinishedCount={unfinished.length} unfinishedTypeIds={unfinished.map((c) => c.typeId)} cardsLoaded={!cardsQ.isPending} onClose={() => setCompleteOpen(false)} />
      )}
      {templateOpen && <SaveTemplateModal project={project} teamId={teamId} onClose={() => setTemplateOpen(false)} />}
    </Stack>
  )
}

function ZoneRow({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <Group justify="space-between" align="center" wrap="wrap" gap="sm">
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <Text fw={600} size="sm">{title}</Text>
        <Text size="xs" c="dimmed">{text}</Text>
      </div>
      {children}
    </Group>
  )
}

function CompleteModal({
  project, teamId, unfinishedCount, unfinishedTypeIds, cardsLoaded, onClose,
}: {
  project: ProjectDto
  teamId: string
  unfinishedCount: number
  unfinishedTypeIds: string[]
  cardsLoaded: boolean
  onClose: () => void
}) {
  const complete = useCompleteProject(teamId)
  const activeQ = useProjects(teamId, 'active')
  const typesQ = useCardTypes(teamId)
  const [targetId, setTargetId] = useState<string | null>(null)

  const targets = (activeQ.data ?? []).filter((p) => p.id !== project.id)
  const target = targets.find((p) => p.id === targetId)
  const unmapped = target
    ? [...new Set(unfinishedTypeIds)].filter((t) => !target.typeFlows.some((tf) => tf.cardTypeId === t))
    : []
  const unmappedNames = unmapped.map((id) => (typesQ.data ?? []).find((t) => t.id === id)?.name ?? 'unknown type')
  const nothingToCarry = cardsLoaded && unfinishedCount === 0

  async function confirm() {
    const r = await complete.mutateAsync({ id: project.id, body: targetId ? { carryOverToProjectId: targetId } : {} })
    notifications.show({
      color: 'green',
      title: 'Project completed',
      message:
        r.carriedOver > 0
          ? `“${project.name}” is archived. ${r.carriedOver} card${r.carriedOver === 1 ? '' : 's'} carried over to “${target?.name ?? 'the selected project'}”.`
          : `“${project.name}” is archived.`,
    })
    onClose()
  }

  return (
    <Modal opened onClose={onClose} title="Complete project" centered>
      <Stack gap="sm">
        <Text size="sm">
          Completing “{project.name}” archives it: no cards can be added or linked any more, and its statistics are frozen as of now. You can reopen it later.
        </Text>
        <Text size="sm" fw={600} data-testid="unfinished-count">
          {!cardsLoaded
            ? 'Counting unfinished cards…'
            : unfinishedCount === 0
              ? 'There are no unfinished cards.'
              : `${unfinishedCount} unfinished card${unfinishedCount === 1 ? '' : 's'} ${unfinishedCount === 1 ? 'has' : 'have'} this project as primary.`}
        </Text>
        <Select
          label="Carry unfinished cards over to…"
          description="They become primary there and keep a link here. Leave empty to keep them in this project."
          placeholder={targets.length === 0 ? 'No other active projects' : 'Do not carry over'}
          clearable
          searchable
          data={targets.map((p) => ({ value: p.id, label: p.name }))}
          value={targetId}
          onChange={setTargetId}
          disabled={nothingToCarry || targets.length === 0}
          data-testid="carry-over-select"
        />
        {unmapped.length > 0 && (
          <Alert color="yellow" variant="light" icon={<IconAlertCircle size={16} />}>
            “{target?.name}” does not map the card type{unmapped.length === 1 ? '' : 's'} {unmappedNames.join(', ')}. Add the mapping there first, or the
            server will refuse to carry these cards over.
          </Alert>
        )}
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button color="orange" loading={complete.isPending} onClick={() => void confirm()} data-testid="complete-project-confirm">
            Complete project
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function SaveTemplateModal({ project, teamId, onClose }: { project: ProjectDto; teamId: string; onClose: () => void }) {
  const save = useSaveAsTemplate(teamId)
  const [name, setName] = useState(project.name)
  const [pattern, setPattern] = useState(project.name)
  const [duration, setDuration] = useState<number | string>(
    project.startDate && project.endDate ? Math.max(1, daysBetween(project.startDate, project.endDate) + 1) : '',
  )
  const [includeCards, setIncludeCards] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const durationValue = duration === '' ? null : Number(duration)
  const errors = {
    name: name.trim() ? null : 'Name is required',
    pattern: pattern.trim() ? null : 'Name pattern is required',
    duration: durationValue !== null && (!Number.isInteger(durationValue) || durationValue < 1 || durationValue > 730) ? 'Use a whole number between 1 and 730' : null,
  }

  async function submit() {
    if (errors.name || errors.pattern || errors.duration) {
      setShowErrors(true)
      return
    }
    const t = await save.mutateAsync({
      id: project.id,
      body: { name: name.trim(), namePattern: pattern.trim(), durationDays: durationValue, includeCards },
    })
    notifications.show({
      color: 'green',
      title: 'Template saved',
      autoClose: 8000,
      message: (
        <>
          “{t.name}” is ready{t.blueprints.length > 0 ? ` with ${t.blueprints.length} card${t.blueprints.length === 1 ? '' : 's'}` : ''}.{' '}
          <Anchor component={Link} to={`/t/${teamId}/templates`} size="sm">Open templates</Anchor>
        </>
      ),
    })
    onClose()
  }

  return (
    <Modal opened onClose={onClose} title="Save as template" centered>
      <Stack gap="sm">
        <TextInput label="Template name" required value={name} maxLength={80} onChange={(e) => setName(e.currentTarget.value)} error={showErrors ? errors.name : null} data-testid="template-name" data-autofocus />
        <TextInput
          label="Project name pattern"
          description="Use {n} for the running number and {date} for the start date, e.g. Sprint {n}."
          required
          value={pattern}
          maxLength={120}
          onChange={(e) => setPattern(e.currentTarget.value)}
          error={showErrors ? errors.pattern : null}
          data-testid="template-pattern"
        />
        <NumberInput
          label="Duration in days"
          description="Used to suggest an end date. Leave empty for open-ended projects."
          min={1}
          max={730}
          allowDecimal={false}
          allowNegative={false}
          value={duration}
          onChange={setDuration}
          error={showErrors ? errors.duration : null}
          data-testid="template-duration"
        />
        <Checkbox
          label="Include current cards as blueprint cards"
          description="Copies the title and description of up to 100 cards that have this project as primary."
          checked={includeCards}
          onChange={(e) => setIncludeCards(e.currentTarget.checked)}
          data-testid="template-include-cards"
        />
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => void submit()} data-testid="template-save">Save template</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
