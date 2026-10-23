import {
  ActionIcon, Alert, Badge, Box, Button, Card, Code, Collapse, Drawer, Group, Loader, NumberInput, Paper, Select, Stack, Text, Textarea, TextInput, Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconChevronDown, IconChevronUp, IconPencil, IconPlayerPlay, IconPlus, IconTemplate, IconTrash } from '@tabler/icons-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { newShortId, renderNamePattern, templateInput, todayString } from '@pm/shared'
import type { BlueprintDto, CardTypeDto, TemplateDto, TypeFlow } from '@pm/shared'
import { useCardTypes, useDeleteTemplate, useFlows, useSaveTemplate, useTemplates } from '../../api/queries'
import { useTeamId } from '../../auth/hooks'
import { TypeBadge } from '../../components/common/badges'
import { confirmAction } from '../../components/common/confirm'
import { EmptyState } from '../../components/common/EmptyState'
import { PageHeader } from '../../components/common/PageHeader'
import { TypeFlowEditor } from '../../components/projects/TypeFlowEditor'
import { NewProjectWizard } from '../../components/projects/NewProjectWizard'

const MarkdownEditor = lazy(() => import('../../components/markdown/MarkdownEditor'))

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

interface Values {
  name: string
  description: string
  namePattern: string
  durationDays: number | ''
  typeFlows: TypeFlow[]
  blueprints: BlueprintDto[]
}

const emptyValues = (): Values => ({ name: '', description: '', namePattern: 'Project {n}', durationDays: '', typeFlows: [], blueprints: [] })
const valuesOf = (t: TemplateDto): Values => ({
  name: t.name,
  description: t.description,
  namePattern: t.namePattern,
  durationDays: t.durationDays ?? '',
  typeFlows: t.typeFlows.map((tf) => ({ ...tf })),
  blueprints: t.blueprints.map((b) => ({ ...b })),
})

interface Issue { path: PropertyKey[]; message: string; code: string }

function describeIssue(issue: Issue, v: Values): string {
  const [head, idx, leaf] = issue.path
  const tooSmall = issue.code === 'too_small'
  const tooBig = issue.code === 'too_big'
  if (head === 'name') return tooSmall ? 'Name is required' : tooBig ? 'Name is too long (max 80 characters)' : issue.message
  if (head === 'description' && tooBig) return 'Description is too long (max 500 characters)'
  if (head === 'namePattern') return tooSmall ? 'Name pattern is required' : tooBig ? 'Name pattern is too long (max 120 characters)' : issue.message
  if (head === 'durationDays') return 'Duration must be a whole number of days between 1 and 730'
  if (head === 'typeFlows' && typeof idx !== 'number') return tooSmall ? 'Map at least one card type to a flow' : issue.message
  if (head === 'blueprints' && typeof idx === 'number') {
    const title = v.blueprints[idx]?.title.trim()
    const label = title ? `Blueprint "${title}"` : `Blueprint ${idx + 1}`
    if (leaf === 'title') return `${label}: ${tooSmall ? 'title is required' : tooBig ? 'title is too long (max 200 characters)' : issue.message}`
    return `${label}: ${issue.message}`
  }
  return issue.message
}

function BlueprintRow({
  blueprint, index, typeOptions, onChange, onRemove,
}: {
  blueprint: BlueprintDto
  index: number
  typeOptions: { value: string; label: string }[]
  onChange: (patch: Partial<BlueprintDto>) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const toggle = () => {
    setLoaded(true)
    setOpen((o) => !o)
  }
  return (
    <Paper withBorder p="xs" data-testid="blueprint-row">
      <Group gap="xs" align="flex-end" wrap="wrap">
        <Select
          label={index === 0 ? 'Card type' : undefined} aria-label="Blueprint card type" w={170} data={typeOptions} value={blueprint.typeId}
          allowDeselect={false} data-testid="blueprint-type" onChange={(v) => v && onChange({ typeId: v })}
        />
        <TextInput
          label={index === 0 ? 'Title' : undefined} aria-label="Blueprint title" placeholder="Card title" style={{ flex: '1 1 180px' }}
          value={blueprint.title} data-testid="blueprint-title" onChange={(e) => onChange({ title: e.currentTarget.value })}
        />
        <Button
          size="xs" variant="subtle" onClick={toggle} data-testid="blueprint-body-toggle"
          rightSection={open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        >
          {open ? 'Hide body' : blueprint.body.trim() ? 'Edit body' : 'Add body'}
        </Button>
        <ActionIcon variant="subtle" color="red" aria-label={`Remove blueprint ${blueprint.title || index + 1}`} onClick={onRemove} data-testid="remove-blueprint">
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
      <Collapse expanded={open}>
        <Box mt="xs">
          {loaded && (
            <Suspense fallback={<Loader size="xs" />}>
              <MarkdownEditor value={blueprint.body} onChange={(body) => onChange({ body })} placeholder="Describe the card (markdown)" minHeight={140} />
            </Suspense>
          )}
        </Box>
      </Collapse>
    </Paper>
  )
}

function TemplateForm({ teamId, template, onClose }: { teamId: string; template: TemplateDto | null; onClose: () => void }) {
  const save = useSaveTemplate(teamId)
  const types = useCardTypes(teamId)
  const flows = useFlows(teamId)
  const [v, setV] = useState<Values>(() => (template ? valuesOf(template) : emptyValues()))
  const [attempted, setAttempted] = useState(false)
  const patch = (p: Partial<Values>) => setV((cur) => ({ ...cur, ...p }))

  const typesById = useMemo(() => new Map<string, CardTypeDto>((types.data ?? []).map((t) => [t.id, t])), [types.data])
  const typeOptions = v.typeFlows.map((tf) => {
    const t = typesById.get(tf.cardTypeId)
    return { value: tf.cardTypeId, label: t ? `${t.icon} ${t.name}` : 'Unknown type' }
  })

  const changeMapping = (next: TypeFlow[]) => {
    const keep = new Set(next.map((tf) => tf.cardTypeId))
    const dropped = v.blueprints.filter((b) => !keep.has(b.typeId))
    const apply = () => setV((cur) => ({ ...cur, typeFlows: next, blueprints: cur.blueprints.filter((b) => keep.has(b.typeId)) }))
    if (dropped.length === 0) return apply()
    confirmAction({
      title: 'Remove blueprint cards?',
      message: `${plural(dropped.length, 'blueprint card')} of a card type that is no longer mapped will be removed from this template.`,
      confirmLabel: 'Remove',
      onConfirm: apply,
    })
  }

  const addBlueprint = () => {
    const first = v.typeFlows[0]
    if (!first) return
    patch({ blueprints: [...v.blueprints, { id: newShortId(), typeId: first.cardTypeId, title: '', body: '' }] })
  }
  const updateBlueprint = (i: number, p: Partial<BlueprintDto>) => patch({ blueprints: v.blueprints.map((b, idx) => (idx === i ? { ...b, ...p } : b)) })

  const nextNumber = (template?.projectsCreated ?? 0) + 1
  const preview = v.namePattern.trim() ? renderNamePattern(v.namePattern, { n: nextNumber, date: todayString() }) : ''

  const body = {
    name: v.name,
    description: v.description,
    namePattern: v.namePattern,
    durationDays: typeof v.durationDays === 'number' ? v.durationDays : null,
    typeFlows: v.typeFlows,
    blueprints: v.blueprints,
  }
  const parsed = templateInput.safeParse(body)
  const issues = attempted && !parsed.success ? [...new Set(parsed.error.issues.map((i) => describeIssue(i, v)))] : []

  const submit = () => {
    setAttempted(true)
    if (!parsed.success) return
    save.mutate(
      { id: template?.id, body: parsed.data },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', message: template ? `Template "${parsed.data.name}" saved` : `Template "${parsed.data.name}" created` })
          onClose()
        },
      },
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }} noValidate>
      <Stack gap="lg">
        <Stack gap="sm">
          <TextInput
            label="Name" placeholder="Two-week sprint" required data-autofocus data-testid="template-name"
            value={v.name} onChange={(e) => patch({ name: e.currentTarget.value })}
            error={attempted && !v.name.trim() ? 'Name is required' : undefined}
          />
          <Textarea
            label="Description" autosize minRows={2} maxRows={5} data-testid="template-description"
            value={v.description} onChange={(e) => patch({ description: e.currentTarget.value })}
          />
          <TextInput
            label="Project name pattern" required data-testid="template-name-pattern"
            description={<>Use <Code>{'{n}'}</Code> for the sequence number and <Code>{'{date}'}</Code> for the start date.</>}
            value={v.namePattern} onChange={(e) => patch({ namePattern: e.currentTarget.value })}
            error={attempted && !v.namePattern.trim() ? 'Name pattern is required' : undefined}
          />
          <Text size="sm" c="dimmed" data-testid="template-name-preview">
            Next project: <Text span fw={600} c={preview ? undefined : 'dimmed'}>{preview || '(empty)'}</Text>
          </Text>
          <NumberInput
            label="Duration (days)" description="Optional. The end date is set to start + duration - 1 days. Leave empty for open-ended projects."
            min={1} max={730} allowDecimal={false} allowNegative={false} w={{ base: '100%', xs: 260 }} data-testid="template-duration"
            value={v.durationDays} onChange={(d) => patch({ durationDays: typeof d === 'number' ? d : '' })}
          />
        </Stack>

        <Stack gap="xs">
          <Box>
            <Title order={5}>Card types and flows</Title>
            <Text size="xs" c="dimmed">Which card types projects from this template use, and the flow each follows.</Text>
          </Box>
          <TypeFlowEditor value={v.typeFlows} onChange={changeMapping} types={types.data ?? []} flows={flows.data ?? []} />
        </Stack>

        <Stack gap="xs">
          <Group justify="space-between" wrap="wrap">
            <Box>
              <Title order={5}>Blueprint cards</Title>
              <Text size="xs" c="dimmed">Cards created automatically in every new project from this template.</Text>
            </Box>
            <Button
              size="xs" variant="light" leftSection={<IconPlus size={14} />} disabled={v.typeFlows.length === 0} onClick={addBlueprint} data-testid="add-blueprint"
            >
              Add blueprint card
            </Button>
          </Group>
          {v.typeFlows.length === 0 && <Text size="sm" c="dimmed">Map at least one card type first.</Text>}
          {v.typeFlows.length > 0 && v.blueprints.length === 0 && <Text size="sm" c="dimmed">No blueprint cards.</Text>}
          {v.blueprints.map((b, i) => (
            <BlueprintRow
              key={b.id} blueprint={b} index={i} typeOptions={typeOptions}
              onChange={(p) => updateBlueprint(i, p)} onRemove={() => patch({ blueprints: v.blueprints.filter((_, idx) => idx !== i) })}
            />
          ))}
        </Stack>

        {issues.length > 0 && (
          <Alert color="red" variant="light" title="Please fix the following" data-testid="template-issues">
            <Stack gap={2}>
              {issues.map((m) => <Text key={m} size="sm">{m}</Text>)}
            </Stack>
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending} data-testid="save-template">{template ? 'Save changes' : 'Create template'}</Button>
        </Group>
      </Stack>
    </form>
  )
}

export function TemplatesPage() {
  const teamId = useTeamId()
  const templates = useTemplates(teamId)
  const types = useCardTypes(teamId)
  const flows = useFlows(teamId)
  const remove = useDeleteTemplate(teamId)
  const [drawer, setDrawer] = useState<{ template: TemplateDto | null; key: number; opened: boolean } | null>(null)
  const [wizard, setWizard] = useState<{ templateId: string; key: number; opened: boolean } | null>(null)

  const typesById = useMemo(() => new Map<string, CardTypeDto>((types.data ?? []).map((t) => [t.id, t])), [types.data])
  const flowName = useMemo(() => new Map((flows.data ?? []).map((f) => [f.id, f.name])), [flows.data])
  const list = templates.data ?? []

  const openDrawer = (template: TemplateDto | null) => setDrawer((d) => ({ template, key: (d?.key ?? 0) + 1, opened: true }))
  const openWizard = (templateId: string) => setWizard((w) => ({ templateId, key: (w?.key ?? 0) + 1, opened: true }))

  const askDelete = (t: TemplateDto) =>
    confirmAction({
      title: `Delete template "${t.name}"?`,
      message: 'Projects that were already created from this template are not affected. This cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: () => remove.mutate(t.id, { onSuccess: () => notifications.show({ message: `Template "${t.name}" deleted` }) }),
    })

  const newButton = (
    <Button leftSection={<IconPlus size={16} />} onClick={() => openDrawer(null)} data-testid="new-template">New template</Button>
  )

  return (
    <Box maw={900}>
      <PageHeader
        title="Templates"
        description="Blueprints for recurring projects such as sprints: a naming pattern, a duration, flows per card type and starter cards."
        actions={newButton}
      />

      {templates.isPending && <Group justify="center" py="xl"><Loader /></Group>}
      {templates.isError && <Alert color="red" title="Could not load templates">{templates.error.message}</Alert>}
      {templates.isSuccess && list.length === 0 && (
        <EmptyState icon={<IconTemplate size={26} />} title="No templates yet" text="Create a template to spin up consistent projects in a click." action={newButton} />
      )}

      <Stack gap="sm">
        {list.map((t) => (
          <Card key={t.id} withBorder padding="sm" data-testid="template-card">
            <Stack gap="xs">
              <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                <Box style={{ flex: '1 1 280px', minWidth: 0 }}>
                  <Text fw={600} data-testid="template-title">{t.name}</Text>
                  {t.description && <Text size="sm" c="dimmed">{t.description}</Text>}
                </Box>
                <Group gap={4} wrap="wrap">
                  <Button size="xs" leftSection={<IconPlayerPlay size={14} />} onClick={() => openWizard(t.id)} data-testid="use-template">
                    New project from template
                  </Button>
                  <Button size="xs" variant="default" leftSection={<IconPencil size={14} />} onClick={() => openDrawer(t)} data-testid="edit-template">Edit</Button>
                  <Tooltip label="Delete" withArrow>
                    <ActionIcon variant="default" c="red" size={30} aria-label={`Delete ${t.name}`} onClick={() => askDelete(t)} data-testid="delete-template">
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
              <Group gap="xs" wrap="wrap">
                <Text size="sm">Pattern <Code>{t.namePattern}</Code></Text>
                <Text size="sm" c="dimmed">·</Text>
                <Text size="sm">{t.durationDays ? plural(t.durationDays, 'day') : 'No fixed duration'}</Text>
              </Group>
              <Group gap={6} wrap="wrap">
                {t.typeFlows.map((tf) => (
                  <Tooltip key={tf.cardTypeId} label={`Flow: ${flowName.get(tf.flowId) ?? 'unknown'}`} withArrow>
                    <Box><TypeBadge type={typesById.get(tf.cardTypeId)} /></Box>
                  </Tooltip>
                ))}
              </Group>
              <Group gap="xs" wrap="wrap">
                <Badge variant="outline" color="gray" size="sm">{plural(t.blueprints.length, 'blueprint card')}</Badge>
                <Badge variant="outline" color="gray" size="sm" data-testid="template-used">Used {plural(t.projectsCreated, 'time')}</Badge>
              </Group>
            </Stack>
          </Card>
        ))}
      </Stack>

      {drawer && (
        <Drawer
          opened={drawer.opened} onClose={() => setDrawer((d) => d && { ...d, opened: false })} position="right" size="min(780px, 100%)"
          title={drawer.template ? 'Edit template' : 'New template'}
        >
          <TemplateForm key={drawer.key} teamId={teamId} template={drawer.template} onClose={() => setDrawer((d) => d && { ...d, opened: false })} />
        </Drawer>
      )}
      {wizard && (
        <NewProjectWizard
          key={wizard.key} opened={wizard.opened} initialTemplateId={wizard.templateId}
          onClose={() => setWizard((w) => w && { ...w, opened: false })}
        />
      )}
    </Box>
  )
}
