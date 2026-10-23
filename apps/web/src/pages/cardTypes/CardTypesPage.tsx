import {
  ActionIcon, Alert, Badge, Box, Button, Card, CheckIcon, ColorSwatch, Group, Loader, Modal, Select, Stack, Switch, TagsInput, Text, Textarea,
  TextInput, Tooltip, UnstyledButton,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconArchive, IconArchiveOff, IconCards, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { cardTypeInput, FIELD_KINDS, newShortId } from '@pm/shared'
import type { CardTypeDto, FieldKind } from '@pm/shared'
import { useArchiveCardType, useCardTypes, useDeleteCardType, useSaveCardType } from '../../api/queries'
import { useTeamId } from '../../auth/hooks'
import { confirmAction } from '../../components/common/confirm'
import { EmptyState } from '../../components/common/EmptyState'
import { PageHeader } from '../../components/common/PageHeader'
import { COLOR_NAMES } from '../../utils/colors'

const QUICK_EMOJIS = ['📝', '🐛', '✨', '📖', '🚀', '🔧', '📌', '💡', '🎯', '❓']
const KIND_LABEL: Record<FieldKind, string> = { text: 'Text', number: 'Number', select: 'Select', date: 'Date', checkbox: 'Checkbox' }
const KIND_OPTIONS = FIELD_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))

interface FieldRow {
  id: string
  name: string
  kind: FieldKind
  options: string[]
  required: boolean
  /** True for fields that already exist on the server: their kind is locked. */
  existing: boolean
}
interface TypeFormValues {
  name: string
  icon: string
  color: string
  description: string
  fields: FieldRow[]
}

const emptyValues = (): TypeFormValues => ({ name: '', icon: '📝', color: 'blue', description: '', fields: [] })
const valuesOf = (t: CardTypeDto): TypeFormValues => ({
  name: t.name,
  icon: t.icon,
  color: t.color,
  description: t.description,
  fields: t.fields.map((f) => ({ id: f.id, name: f.name, kind: f.kind, options: f.options ?? [], required: f.required, existing: true })),
})

interface Issue { path: PropertyKey[]; message: string; code: string }

/** Turn zod issues into short sentences for the form footer. */
function describeIssue(issue: Issue, v: TypeFormValues): string {
  const [head, idx, leaf] = issue.path
  const tooSmall = issue.code === 'too_small'
  const tooBig = issue.code === 'too_big'
  if (head === 'fields' && typeof idx === 'number') {
    const label = v.fields[idx]?.name.trim() ? `Field "${v.fields[idx]!.name.trim()}"` : `Field ${idx + 1}`
    if (leaf === 'name' && tooSmall) return `${label}: name is required`
    if (leaf === 'name' && tooBig) return `${label}: name is too long (max 60 characters)`
    if (leaf === 'options' && issue.code !== 'custom') return `${label}: options must be 1-60 characters each`
    return `${label}: ${issue.message}`
  }
  if (head === 'fields') return `Fields: ${issue.message}`
  if (head === 'name' && tooSmall) return 'Name is required'
  if (head === 'name' && tooBig) return 'Name is too long (max 60 characters)'
  if (head === 'icon') return 'Icon must be a single emoji (max 8 characters)'
  if (head === 'description' && tooBig) return 'Description is too long (max 500 characters)'
  return issue.message
}

function CardTypeFormModal({ teamId, editing, opened, onClose }: { teamId: string; editing: CardTypeDto | null; opened: boolean; onClose: () => void }) {
  const save = useSaveCardType(teamId)
  const form = useForm<TypeFormValues>({ mode: 'controlled', initialValues: editing ? valuesOf(editing) : emptyValues() })
  const [issues, setIssues] = useState<string[]>([])
  const { fields } = form.values

  const setField = (i: number, patch: Partial<FieldRow>) => form.setFieldValue('fields', fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))

  const submit = (v: TypeFormValues) => {
    const body = {
      name: v.name,
      icon: v.icon.trim() || '📝',
      color: v.color,
      description: v.description,
      fields: v.fields.map((f) => ({
        id: f.id,
        name: f.name,
        kind: f.kind,
        required: f.required,
        ...(f.kind === 'select' ? { options: f.options } : {}),
      })),
    }
    const parsed = cardTypeInput.safeParse(body)
    if (!parsed.success) {
      setIssues([...new Set(parsed.error.issues.map((i) => describeIssue(i, v)))])
      return
    }
    setIssues([])
    save.mutate(
      { id: editing?.id, body: parsed.data },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', message: editing ? `Card type "${parsed.data.name}" saved` : `Card type "${parsed.data.name}" created` })
          onClose()
        },
      },
    )
  }

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? 'Edit card type' : 'New card type'} size="lg" centered>
      <form onSubmit={form.onSubmit(submit)} noValidate>
        <Stack gap="md">
          <TextInput label="Name" placeholder="Task, Bug, Story..." required data-autofocus data-testid="card-type-name" {...form.getInputProps('name')} />

          <Stack gap={6}>
            <Group gap="xs" align="flex-end" wrap="wrap">
              <TextInput label="Icon" description="An emoji" w={110} maxLength={8} data-testid="card-type-icon" {...form.getInputProps('icon')} />
              <Group gap={4} wrap="wrap" pb={2} style={{ flex: 1 }}>
                {QUICK_EMOJIS.map((e) => (
                  <ActionIcon
                    key={e}
                    variant={form.values.icon === e ? 'filled' : 'default'}
                    size="md"
                    aria-label={`Use icon ${e}`}
                    onClick={() => form.setFieldValue('icon', e)}
                  >
                    <span>{e}</span>
                  </ActionIcon>
                ))}
              </Group>
            </Group>
          </Stack>

          <Stack gap={6}>
            <Text size="sm" fw={500}>Color</Text>
            <Group gap="xs" wrap="wrap">
              {COLOR_NAMES.map((c) => (
                <Tooltip key={c} label={c} withArrow>
                  <UnstyledButton
                    aria-label={`Color ${c}`}
                    aria-pressed={form.values.color === c}
                    data-testid={`card-type-color-${c}`}
                    onClick={() => form.setFieldValue('color', c)}
                  >
                    <ColorSwatch color={`var(--mantine-color-${c}-6)`} size={26}>
                      {form.values.color === c && <CheckIcon size={12} color="white" />}
                    </ColorSwatch>
                  </UnstyledButton>
                </Tooltip>
              ))}
            </Group>
          </Stack>

          <Textarea label="Description" autosize minRows={2} maxRows={5} data-testid="card-type-description" {...form.getInputProps('description')} />

          <Stack gap="xs">
            <Group justify="space-between">
              <Box>
                <Text size="sm" fw={500}>Custom fields</Text>
                <Text size="xs" c="dimmed">Extra data on every card of this type.</Text>
              </Box>
              <Button
                size="xs" variant="light" leftSection={<IconPlus size={14} />} data-testid="add-field"
                onClick={() => form.setFieldValue('fields', [...fields, { id: newShortId(), name: '', kind: 'text', options: [], required: false, existing: false }])}
              >
                Add field
              </Button>
            </Group>
            {fields.length === 0 && <Text size="sm" c="dimmed">No custom fields.</Text>}
            {fields.map((f, i) => (
              <Card key={f.id} withBorder padding="xs" data-testid="field-row">
                <Stack gap="xs">
                  <Group gap="xs" align="flex-start" wrap="wrap">
                    <TextInput
                      label={i === 0 ? 'Field name' : undefined} aria-label="Field name" placeholder="Field name" style={{ flex: '1 1 160px' }}
                      value={f.name} onChange={(e) => setField(i, { name: e.currentTarget.value })} data-testid="field-name"
                    />
                    <Tooltip label="The kind of an existing field cannot be changed" disabled={!f.existing} withArrow>
                      <Select
                        label={i === 0 ? 'Kind' : undefined} aria-label="Field kind" w={140} data={KIND_OPTIONS} value={f.kind} allowDeselect={false}
                        disabled={f.existing} data-testid="field-kind"
                        onChange={(k) => k && setField(i, { kind: k as FieldKind })}
                      />
                    </Tooltip>
                    <Switch
                      label="Required" mt={i === 0 ? 30 : 6} checked={f.required} data-testid="field-required"
                      onChange={(e) => setField(i, { required: e.currentTarget.checked })}
                    />
                    <ActionIcon
                      variant="subtle" color="red" mt={i === 0 ? 24 : 0} aria-label={`Remove field ${f.name || i + 1}`} data-testid="remove-field"
                      onClick={() => form.setFieldValue('fields', fields.filter((_, idx) => idx !== i))}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                  {f.existing && <Text size="xs" c="dimmed">Kind is locked because this field already exists.</Text>}
                  {f.kind === 'select' && (
                    <TagsInput
                      label="Options" placeholder="Type an option and press Enter" value={f.options} data-testid="field-options"
                      onChange={(options) => setField(i, { options })}
                    />
                  )}
                </Stack>
              </Card>
            ))}
          </Stack>

          {issues.length > 0 && (
            <Alert color="red" variant="light" title="Please fix the following" data-testid="card-type-issues">
              <Stack gap={2}>
                {issues.map((m) => <Text key={m} size="sm">{m}</Text>)}
              </Stack>
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={save.isPending} data-testid="save-card-type">{editing ? 'Save changes' : 'Create card type'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

export function CardTypesPage() {
  const teamId = useTeamId()
  const types = useCardTypes(teamId)
  const archive = useArchiveCardType(teamId)
  const remove = useDeleteCardType(teamId)
  const [showArchived, setShowArchived] = useState(true)
  const [form, setForm] = useState<{ editing: CardTypeDto | null; key: number; opened: boolean } | null>(null)

  const all = types.data ?? []
  const archivedCount = all.filter((t) => t.archived).length
  const visible = useMemo(
    () => all.filter((t) => showArchived || !t.archived).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name)),
    [all, showArchived],
  )

  const openForm = (editing: CardTypeDto | null) => setForm((f) => ({ editing, key: (f?.key ?? 0) + 1, opened: true }))

  const toggleArchive = (t: CardTypeDto) =>
    archive.mutate(
      { id: t.id, archive: !t.archived },
      { onSuccess: () => notifications.show({ message: t.archived ? `"${t.name}" is available again` : `"${t.name}" archived. Existing cards keep working; it can't be used for new cards.` }) },
    )

  const askDelete = (t: CardTypeDto) =>
    confirmAction({
      title: `Delete "${t.name}"?`,
      message: 'This cannot be undone. A card type that is used by cards, projects or templates cannot be deleted - archive it instead to stop using it for new cards.',
      confirmLabel: 'Delete',
      onConfirm: () => remove.mutate(t.id, { onSuccess: () => notifications.show({ message: `Card type "${t.name}" deleted` }) }),
    })

  return (
    <Box maw={900}>
      <PageHeader
        title="Card types"
        description="Define the kinds of cards your team works with and the custom fields each one carries."
        actions={<Button leftSection={<IconPlus size={16} />} onClick={() => openForm(null)} data-testid="new-card-type">New card type</Button>}
      />

      {archivedCount > 0 && (
        <Switch
          mb="md" label={`Show archived (${archivedCount})`} checked={showArchived} data-testid="toggle-archived"
          onChange={(e) => setShowArchived(e.currentTarget.checked)}
        />
      )}

      {types.isPending && <Group justify="center" py="xl"><Loader /></Group>}
      {types.isError && <Alert color="red" title="Could not load card types">{types.error.message}</Alert>}
      {types.isSuccess && all.length === 0 && (
        <EmptyState
          icon={<IconCards size={26} />} title="No card types yet"
          text="Create a card type (for example Task or Bug) before adding cards."
          action={<Button leftSection={<IconPlus size={16} />} onClick={() => openForm(null)}>New card type</Button>}
        />
      )}

      <Stack gap="sm">
        {visible.map((t) => (
          <Card key={t.id} withBorder padding="sm" data-testid="card-type-row" data-archived={t.archived || undefined} style={{ opacity: t.archived ? 0.6 : 1 }}>
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
              <Group gap="sm" align="flex-start" wrap="nowrap" style={{ flex: '1 1 280px', minWidth: 0 }}>
                <Text size="xl" lh={1.2} aria-hidden>{t.icon}</Text>
                <Stack gap={4} style={{ minWidth: 0 }}>
                  <Group gap="xs" wrap="wrap">
                    <Text fw={600} data-testid="card-type-title">{t.name}</Text>
                    <Badge color={t.color} variant="light" size="sm">{t.color}</Badge>
                    <Badge color="gray" variant="outline" size="sm">{t.fields.length} {t.fields.length === 1 ? 'field' : 'fields'}</Badge>
                    {t.archived && <Badge color="gray" size="sm">Archived</Badge>}
                  </Group>
                  {t.description && <Text size="sm" c="dimmed">{t.description}</Text>}
                  {t.fields.length > 0 && (
                    <Text size="xs" c="dimmed">{t.fields.map((f) => `${f.name}${f.required ? '*' : ''} (${KIND_LABEL[f.kind].toLowerCase()})`).join(' · ')}</Text>
                  )}
                </Stack>
              </Group>
              <Group gap={4} wrap="nowrap">
                <Button size="xs" variant="default" leftSection={<IconPencil size={14} />} onClick={() => openForm(t)} data-testid="edit-card-type">Edit</Button>
                <Tooltip label={t.archived ? 'Unarchive' : 'Archive'} withArrow>
                  <ActionIcon
                    variant="default" size={30} aria-label={`${t.archived ? 'Unarchive' : 'Archive'} ${t.name}`} data-testid="archive-card-type"
                    loading={archive.isPending && archive.variables?.id === t.id} onClick={() => toggleArchive(t)}
                  >
                    {t.archived ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Delete" withArrow>
                  <ActionIcon variant="default" c="red" size={30} aria-label={`Delete ${t.name}`} data-testid="delete-card-type" onClick={() => askDelete(t)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>

      {form && (
        <CardTypeFormModal key={form.key} teamId={teamId} editing={form.editing} opened={form.opened} onClose={() => setForm((f) => f && { ...f, opened: false })} />
      )}
    </Box>
  )
}
