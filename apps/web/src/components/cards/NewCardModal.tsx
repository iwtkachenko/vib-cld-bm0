import { Alert, Button, Group, Modal, MultiSelect, Select, Stack, Text, TextInput } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle } from '@tabler/icons-react'
import { useMemo, useState, type FormEvent } from 'react'
import type { CreateCardBody, FieldValue } from '@pm/shared'
import { useCreateCard, useProject } from '../../api/queries'
import { useTeamId } from '../../auth/hooks'
import { useTeamLookups } from '../common/lookups'
import { CustomFieldInput } from './CustomFieldInput'
import { LazyMarkdownEditor } from './LazyMarkdownEditor'

export interface NewCardModalProps {
  opened: boolean
  onClose: () => void
  /** Project the card is created in (becomes its primary project). */
  projectId: string
  defaultTypeId?: string
}

export function NewCardModal({ opened, onClose, projectId, defaultTypeId }: NewCardModalProps) {
  const isMobile = useMediaQuery('(max-width: 48em)')
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="New card"
      size="lg"
      fullScreen={!!isMobile}
      data-testid="new-card-modal"
      closeButtonProps={{ 'aria-label': 'Close' }}
    >
      {/* Mantine unmounts the content when closed, so every opening starts with an empty form. */}
      <NewCardForm projectId={projectId} defaultTypeId={defaultTypeId} onClose={onClose} />
    </Modal>
  )
}

const isEmptyValue = (v: FieldValue | undefined) => v === undefined || v === null || v === '' || v === false || (typeof v === 'string' && !v.trim())

function NewCardForm({ projectId, defaultTypeId, onClose }: Pick<NewCardModalProps, 'projectId' | 'defaultTypeId' | 'onClose'>) {
  const teamId = useTeamId()
  const project = useProject(teamId, projectId).data
  const { typesById, members } = useTeamLookups(teamId)
  const create = useCreateCard(teamId)

  const [pickedTypeId, setPickedTypeId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [values, setValues] = useState<Record<string, FieldValue>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mappedTypes = useMemo(
    () => (project?.typeFlows ?? []).map((tf) => typesById.get(tf.cardTypeId)).filter((t): t is NonNullable<typeof t> => !!t && !t.archived),
    [project, typesById],
  )
  const typeId =
    pickedTypeId && mappedTypes.some((t) => t.id === pickedTypeId)
      ? pickedTypeId
      : mappedTypes.find((t) => t.id === defaultTypeId)?.id ?? mappedTypes[0]?.id ?? null
  const type = typeId ? typesById.get(typeId) : undefined
  const archived = project?.state === 'archived'

  const setError = (key: string, message?: string) =>
    setErrors((prev) => {
      const next = { ...prev }
      if (message) next[key] = message
      else delete next[key]
      return next
    })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!type || !typeId) return
    const next: Record<string, string> = {}
    if (!title.trim()) next.title = 'Title is required'
    for (const def of type.fields) {
      if (def.required && def.kind !== 'checkbox' && isEmptyValue(values[def.id])) next[def.id] = 'Required'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const fields: Record<string, FieldValue> = {}
    for (const def of type.fields) {
      const v = values[def.id]
      if (!isEmptyValue(v)) fields[def.id] = v as FieldValue
    }
    const payload: CreateCardBody = { projectId, typeId, title: title.trim(), body, fields, assigneeIds }
    try {
      const card = await create.mutateAsync(payload)
      notifications.show({ color: 'green', title: `${card.key} created`, message: card.title })
      onClose()
    } catch {
      // the global mutation handler already shows the error; keep the form open
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="sm">
        {archived && (
          <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
            This project is archived and does not accept new cards.
          </Alert>
        )}
        {project && !archived && mappedTypes.length === 0 && (
          <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
            No active card type is mapped in this project. Map a type to a flow in the project settings first.
          </Alert>
        )}

        <Select
          label="Type"
          data-testid="new-card-type"
          allowDeselect={false}
          data={mappedTypes.map((t) => ({ value: t.id, label: `${t.icon} ${t.name}` }))}
          value={typeId}
          onChange={(v) => {
            setPickedTypeId(v)
            setErrors({})
          }}
          disabled={mappedTypes.length === 0}
          placeholder={project ? 'No card types available' : 'Loading…'}
        />
        <TextInput
          label="Title"
          placeholder="What needs to be done?"
          data-autofocus
          data-testid="new-card-title"
          maxLength={200}
          value={title}
          onChange={(e) => {
            setTitle(e.currentTarget.value)
            if (errors.title) setError('title')
          }}
          error={errors.title}
          withAsterisk
        />
        <div>
          <Text size="sm" fw={500} mb={4}>Description</Text>
          <LazyMarkdownEditor value={body} onChange={setBody} minHeight={140} placeholder="Add a description (markdown supported)" />
        </div>
        <MultiSelect
          label="Assignees"
          placeholder={assigneeIds.length ? undefined : 'Nobody yet'}
          data-testid="new-card-assignees"
          data={members.map((m) => ({ value: m.userId, label: m.name }))}
          value={assigneeIds}
          onChange={setAssigneeIds}
          searchable
          clearable
        />
        {type && type.fields.length > 0 && (
          <Stack gap="xs" data-testid="new-card-fields">
            <Text size="sm" fw={600}>{type.name} fields</Text>
            {type.fields.map((def) => (
              <CustomFieldInput
                key={`${type.id}:${def.id}`}
                def={def}
                value={values[def.id]}
                onChange={(v) => {
                  setValues((prev) => ({ ...prev, [def.id]: v }))
                  if (errors[def.id]) setError(def.id)
                }}
                error={errors[def.id]}
                withAsterisk={def.required && def.kind !== 'checkbox'}
              />
            ))}
          </Stack>
        )}

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button type="submit" data-testid="new-card-submit" loading={create.isPending} disabled={!type || archived}>
            Create card
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
