import {
  ActionIcon, Anchor, Badge, Button, Divider, Grid, Group, Modal, MultiSelect, Select, Skeleton, Stack, Text, Textarea, Tooltip,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconPencil, IconTrash, IconUnlink, IconX } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Link, useNavigate } from 'react-router'
import { allowedTargets, type CardDto, type CardTypeDto, type FieldValue, type FlowDto, type StatusDef } from '@pm/shared'
import { ApiError } from '../../api/client'
import {
  useCard, useDeleteCard, useLinkCard, useSetPrimary, useTransitionCard, useUnlinkCard, useUpdateCard,
} from '../../api/queries'
import { useTeamId } from '../../auth/hooks'
import { STATUS_CATEGORY_COLOR } from '../../utils/colors'
import { formatDateTime, fromNow } from '../../utils/format'
import { StatusBadge, TypeBadge } from '../common/badges'
import { confirmAction } from '../common/confirm'
import { useTeamLookups } from '../common/lookups'
import { MarkdownView } from '../markdown/MarkdownView'
import { NewProjectWizard } from '../projects/NewProjectWizard'
import { CustomFieldInput } from './CustomFieldInput'
import { LazyMarkdownEditor } from './LazyMarkdownEditor'
import { useCardModal } from './useCardModal'

/** Opens for `?card=<id>` on any team route (mounted once in TeamLayout). */
export function CardModalHost() {
  const { cardId, close } = useCardModal()
  const isMobile = useMediaQuery('(max-width: 48em)')
  // keep rendering the last card while the modal animates out
  const [lastId, setLastId] = useState<string | null>(cardId)
  if (cardId && cardId !== lastId) setLastId(cardId)
  const shownId = cardId ?? lastId
  /** Set by the description editor while it holds unsaved changes. */
  const dirtyRef = useRef(false)

  const requestClose = useCallback(() => {
    if (!dirtyRef.current) return close()
    confirmAction({
      title: 'Discard unsaved changes?',
      message: 'The description has changes that are not saved yet.',
      confirmLabel: 'Discard',
      onConfirm: () => {
        dirtyRef.current = false
        close()
      },
    })
  }, [close])

  return (
    <Modal
      opened={!!cardId}
      onClose={requestClose}
      size={960}
      fullScreen={!!isMobile}
      withCloseButton={false}
      padding="lg"
      data-testid="card-modal"
      aria-label="Card"
    >
      {shownId && <CardModalContent key={shownId} cardId={shownId} close={close} requestClose={requestClose} dirtyRef={dirtyRef} />}
    </Modal>
  )
}

interface ContentProps {
  cardId: string
  close: () => void
  requestClose: () => void
  dirtyRef: MutableRefObject<boolean>
}

function CardModalContent({ cardId, close, requestClose, dirtyRef }: ContentProps) {
  const teamId = useTeamId()
  const query = useCard(teamId, cardId)
  const lookups = useTeamLookups(teamId)
  const deleting = useRef(false)
  const card = query.data

  useEffect(() => {
    if (!query.isError || deleting.current) return
    const notFound = query.error instanceof ApiError && query.error.status === 404
    if (!notFound && card) return // a failed background refresh keeps showing the card we have
    notifications.show({
      color: 'red',
      title: notFound ? 'Card not found' : 'Could not load the card',
      message: notFound ? 'It may have been deleted.' : query.error instanceof Error ? query.error.message : 'Something went wrong',
    })
    dirtyRef.current = false
    close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isError, query.error])

  if (!card) {
    return (
      <Stack gap="md" data-testid="card-loading">
        <Skeleton h={20} w={160} />
        <Skeleton h={34} />
        <Skeleton h={160} />
      </Stack>
    )
  }

  const type = lookups.typesById.get(card.typeId)
  const flow = lookups.flowsById.get(card.flowId)

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Group gap="xs" wrap="wrap">
          <Text c="dimmed" fw={600} data-testid="card-key">{card.key}</Text>
          <TypeBadge type={type} />
        </Group>
        <ActionIcon variant="subtle" color="gray" aria-label="Close card" data-testid="card-close" onClick={requestClose}>
          <IconX size={18} />
        </ActionIcon>
      </Group>

      <Grid gap="xl">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="lg">
            <TitleField card={card} />
            <DescriptionSection card={card} dirtyRef={dirtyRef} />
            <Metadata card={card} />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="lg">
            <StatusSection card={card} flow={flow} loading={lookups.isLoading} />
            <AssigneesSection card={card} />
            {type && type.fields.length > 0 && <FieldsSection card={card} type={type} />}
            <ProjectsSection card={card} dirtyRef={dirtyRef} />
            <Divider />
            <DangerSection card={card} deleting={deleting} onDeleted={() => { dirtyRef.current = false; close() }} />
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  )
}

/* -------------------------------------------------------------------------- */

/** Local draft of a server value; resets whenever the server value changes (after a save, or someone else's edit). */
function useServerDraft<T>(server: T) {
  const [draft, setDraft] = useState(server)
  const sig = JSON.stringify(server)
  const [seen, setSeen] = useState(sig)
  if (sig !== seen) {
    setSeen(sig)
    setDraft(server)
  }
  return [draft, setDraft] as const
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>{children}</Text>
}

/* ---------------------------------- title ---------------------------------- */

function TitleField({ card }: { card: CardDto }) {
  const teamId = useTeamId()
  const update = useUpdateCard(teamId)
  const [title, setTitle] = useServerDraft(card.title)
  const cancelled = useRef(false)

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    const next = title.trim()
    if (!next) return setTitle(card.title)
    if (next === card.title) return setTitle(next)
    setTitle(next)
    update.mutate({ id: card.id, body: { title: next } }, { onError: () => setTitle(card.title) })
  }

  return (
    <Textarea
      data-testid="card-title"
      aria-label="Card title"
      autosize
      minRows={1}
      maxLength={200}
      value={title}
      onChange={(e) => setTitle(e.currentTarget.value.replace(/\n/g, ' '))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          cancelled.current = true
          setTitle(card.title)
          e.currentTarget.blur()
        }
      }}
      data-mantine-stop-propagation
      variant="unstyled"
      styles={{ input: { fontSize: 'var(--mantine-h3-font-size)', fontWeight: 650, lineHeight: 1.3, paddingInline: 0 } }}
    />
  )
}

/* ------------------------------- description ------------------------------- */

function DescriptionSection({ card, dirtyRef }: { card: CardDto; dirtyRef: MutableRefObject<boolean> }) {
  const teamId = useTeamId()
  const update = useUpdateCard(teamId)
  const saved = card.body ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(saved)
  const dirty = editing && draft !== saved

  useEffect(() => {
    dirtyRef.current = dirty
    return () => {
      dirtyRef.current = false
    }
  }, [dirty, dirtyRef])

  const startEditing = () => {
    setDraft(saved)
    setEditing(true)
  }
  const cancel = () => {
    if (!dirty) return setEditing(false)
    confirmAction({
      title: 'Discard changes?',
      message: 'Your changes to the description will be lost.',
      confirmLabel: 'Discard',
      onConfirm: () => setEditing(false),
    })
  }
  const save = () =>
    update.mutate(
      { id: card.id, body: { body: draft } },
      {
        onSuccess: () => {
          setEditing(false)
          notifications.show({ color: 'green', message: 'Description saved' })
        },
      },
    )

  return (
    <div data-testid="card-description">
      <Group justify="space-between" mb={6}>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase">Description</Text>
        {!editing && (
          <Button size="compact-xs" variant="subtle" leftSection={<IconPencil size={14} />} data-testid="card-body-edit" onClick={startEditing}>
            Edit
          </Button>
        )}
      </Group>
      {editing ? (
        <Stack gap="sm">
          <LazyMarkdownEditor value={draft} onChange={setDraft} minHeight={200} placeholder="Add a description (markdown supported)" />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" size="xs" data-testid="card-body-cancel" onClick={cancel} disabled={update.isPending}>Cancel</Button>
            <Button size="xs" data-testid="card-body-save" onClick={save} loading={update.isPending} disabled={!dirty}>Save</Button>
          </Group>
        </Stack>
      ) : (
        <MarkdownView value={saved} />
      )}
    </div>
  )
}

function Metadata({ card }: { card: CardDto }) {
  const teamId = useTeamId()
  const { membersById } = useTeamLookups(teamId)
  const author = membersById.get(card.createdBy)?.name ?? 'a former member'
  return (
    <Group gap="md" c="dimmed" data-testid="card-meta">
      <Text size="xs">Created by {author} · {formatDateTime(card.createdAt)}</Text>
      <Tooltip label={formatDateTime(card.updatedAt)} withArrow>
        <Text size="xs">Updated {fromNow(card.updatedAt)}</Text>
      </Tooltip>
    </Group>
  )
}

/* ---------------------------------- status ---------------------------------- */

function StatusSection({ card, flow, loading }: { card: CardDto; flow: FlowDto | undefined; loading: boolean }) {
  const teamId = useTeamId()
  const transition = useTransitionCard(teamId)
  const current = flow?.statuses.find((s) => s.id === card.statusId)
  const targets = useMemo(
    () => (flow ? allowedTargets(flow, card.statusId).map((id) => flow.statuses.find((s) => s.id === id)).filter((s): s is StatusDef => !!s) : []),
    [flow, card.statusId],
  )

  return (
    <div data-testid="card-status">
      <SectionLabel>Status</SectionLabel>
      {loading && !flow ? (
        <Skeleton h={24} />
      ) : (
        <Stack gap="xs">
          <Group gap="xs">
            <StatusBadge status={current} size="md" />
            {flow && <Text size="xs" c="dimmed">{flow.name}</Text>}
          </Group>
          {card.completedAt && current?.category === 'done' && (
            <Text size="xs" c="dimmed">Completed {formatDateTime(card.completedAt)}</Text>
          )}
          {targets.length > 0 ? (
            <Group gap={6}>
              <Text size="xs" c="dimmed">Move to</Text>
              {targets.map((s) => (
                <Button
                  key={s.id}
                  size="compact-sm"
                  variant="light"
                  color={s.color || STATUS_CATEGORY_COLOR[s.category]}
                  data-testid={`status-target-${s.id}`}
                  disabled={transition.isPending}
                  loading={transition.isPending && transition.variables?.body.toStatusId === s.id}
                  onClick={() => transition.mutate({ id: card.id, body: { expectedStatusId: card.statusId, toStatusId: s.id } })}
                >
                  {s.name}
                </Button>
              ))}
            </Group>
          ) : (
            flow && <Text size="xs" c="dimmed">No transitions are allowed from this status.</Text>
          )}
        </Stack>
      )}
    </div>
  )
}

/* -------------------------------- assignees -------------------------------- */

function AssigneesSection({ card }: { card: CardDto }) {
  const teamId = useTeamId()
  const update = useUpdateCard(teamId)
  const { members } = useTeamLookups(teamId)
  const [ids, setIds] = useServerDraft(card.assigneeIds)
  const data = useMemo(() => {
    const known = new Set(members.map((m) => m.userId))
    return [
      ...members.map((m) => ({ value: m.userId, label: m.name })),
      ...ids.filter((id) => !known.has(id)).map((id) => ({ value: id, label: 'Former member', disabled: true })),
    ]
  }, [members, ids])

  return (
    <div data-testid="card-assignees">
      <SectionLabel>Assignees</SectionLabel>
      <MultiSelect
        aria-label="Assignees"
        placeholder={ids.length ? undefined : 'Unassigned'}
        data={data}
        value={ids}
        searchable
        clearable
        comboboxProps={{ withinPortal: true }}
        onChange={(next) => {
          setIds(next)
          update.mutate({ id: card.id, body: { assigneeIds: next } }, { onError: () => setIds(card.assigneeIds) })
        }}
      />
    </div>
  )
}

/* ------------------------------ custom fields ------------------------------ */

function FieldsSection({ card, type }: { card: CardDto; type: CardTypeDto }) {
  return (
    <div data-testid="card-fields">
      <SectionLabel>{type.name} fields</SectionLabel>
      <Stack gap="xs">
        {type.fields.map((def) => (
          <FieldRow key={def.id} card={card} def={def} />
        ))}
      </Stack>
    </div>
  )
}

function FieldRow({ card, def }: { card: CardDto; def: CardTypeDto['fields'][number] }) {
  const teamId = useTeamId()
  const update = useUpdateCard(teamId)
  const server: FieldValue = card.fields[def.id] ?? null
  const [value, setValue] = useServerDraft<FieldValue>(server)

  const commit = (next: FieldValue) => {
    const normalized: FieldValue = typeof next === 'string' && !next.trim() ? null : next
    if (normalized === server) return
    // `null` clears the value on the server
    update.mutate({ id: card.id, body: { fields: { [def.id]: normalized } } }, { onError: () => setValue(server) })
  }

  return <CustomFieldInput def={def} value={value} onChange={setValue} onCommit={commit} size="sm" />
}

/* -------------------------------- projects -------------------------------- */

function ProjectsSection({ card, dirtyRef }: { card: CardDto; dirtyRef: MutableRefObject<boolean> }) {
  const teamId = useTeamId()
  const navigate = useNavigate()
  const { projects, projectsById } = useTeamLookups(teamId)
  const setPrimary = useSetPrimary(teamId)
  const link = useLinkCard(teamId)
  const unlink = useUnlinkCard(teamId)
  const [wizardOpen, setWizardOpen] = useState(false)
  const preselected = useMemo(() => [{ cardId: card.id, mode: 'move' as const }], [card.id])

  const primary = projectsById.get(card.primaryProjectId)
  const linked = card.projectIds.filter((id) => id !== card.primaryProjectId)
  const linkable = projects.filter((p) => p.state === 'active' && !card.projectIds.includes(p.id))
  const movable = projects.filter(
    (p) => p.state === 'active' && p.id !== card.primaryProjectId && p.typeFlows.some((tf) => tf.cardTypeId === card.typeId),
  )

  const goTo = (to: string) => {
    if (!dirtyRef.current) return navigate(to)
    confirmAction({
      title: 'Discard unsaved changes?',
      message: 'The description has changes that are not saved yet.',
      confirmLabel: 'Discard',
      onConfirm: () => {
        dirtyRef.current = false
        navigate(to)
      },
    })
  }

  const row = (projectId: string, isPrimary: boolean) => {
    const p = projectsById.get(projectId)
    const href = `/t/${teamId}/projects/${projectId}/board`
    return (
      <Group key={projectId} justify="space-between" wrap="nowrap" gap="xs" data-testid="card-project-row" data-project-id={projectId}>
        <Group gap={6} wrap="nowrap" miw={0}>
          <Anchor
            component={Link}
            to={href}
            size="sm"
            fw={500}
            truncate
            onClick={(e: React.MouseEvent) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
              e.preventDefault()
              goTo(href)
            }}
          >
            {p?.name ?? 'Unknown project'}
          </Anchor>
          {isPrimary && <Badge size="xs" variant="filled" data-testid="card-primary-badge">Primary</Badge>}
          {p?.state === 'archived' && <Badge size="xs" variant="light" color="gray">Archived</Badge>}
        </Group>
        {!isPrimary && (
          <Group gap={2} wrap="nowrap">
            <Button
              size="compact-xs"
              variant="subtle"
              data-testid="make-primary"
              disabled={p?.state === 'archived' || setPrimary.isPending}
              loading={setPrimary.isPending && setPrimary.variables?.body.projectId === projectId}
              onClick={() =>
                setPrimary.mutate(
                  { id: card.id, body: { projectId, keepPreviousLink: true } },
                  { onSuccess: () => notifications.show({ color: 'green', message: `${p?.name ?? 'The project'} is now the primary project` }) },
                )
              }
            >
              Make primary
            </Button>
            <Tooltip label="Unlink" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`Unlink from ${p?.name ?? 'project'}`}
                data-testid="unlink-project"
                disabled={unlink.isPending}
                onClick={() =>
                  unlink.mutate(
                    { id: card.id, projectId },
                    { onSuccess: () => notifications.show({ message: `Unlinked from ${p?.name ?? 'the project'}` }) },
                  )
                }
              >
                <IconUnlink size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>
    )
  }

  return (
    <div data-testid="card-projects">
      <SectionLabel>Projects</SectionLabel>
      <Stack gap="xs">
        {row(card.primaryProjectId, true)}
        {linked.map((id) => row(id, false))}

        <Select
          mt="xs"
          size="xs"
          aria-label="Link to project"
          placeholder="Link to project…"
          data-testid="link-project-select"
          data={linkable.map((p) => ({ value: p.id, label: p.name }))}
          value={null}
          searchable
          nothingFoundMessage="No other active projects"
          disabled={linkable.length === 0 || link.isPending}
          onChange={(projectId) => {
            if (!projectId) return
            const p = projectsById.get(projectId)
            link.mutate({ id: card.id, projectId }, { onSuccess: () => notifications.show({ color: 'green', message: `Linked to ${p?.name ?? 'the project'}` }) })
          }}
        />
        <Select
          size="xs"
          aria-label="Move to project"
          placeholder="Move to project…"
          description={`Moves the card out of ${primary?.name ?? 'its primary project'}. It then follows the target project's flow, and its status is mapped to the closest matching status.`}
          data-testid="move-project-select"
          data={movable.map((p) => ({ value: p.id, label: p.name }))}
          value={null}
          searchable
          nothingFoundMessage="No other active project accepts this card type"
          disabled={movable.length === 0 || setPrimary.isPending}
          onChange={(projectId) => {
            if (!projectId) return
            const p = projectsById.get(projectId)
            setPrimary.mutate(
              { id: card.id, body: { projectId, keepPreviousLink: false } },
              { onSuccess: () => notifications.show({ color: 'green', message: `Moved to ${p?.name ?? 'the project'}` }) },
            )
          }}
        />
        <Button size="xs" variant="light" data-testid="move-to-new-project" onClick={() => setWizardOpen(true)}>
          Move to a new project from a template…
        </Button>
      </Stack>
      <NewProjectWizard opened={wizardOpen} onClose={() => setWizardOpen(false)} preselectedCards={preselected} />
    </div>
  )
}

/* ---------------------------------- danger ---------------------------------- */

function DangerSection({ card, deleting, onDeleted }: { card: CardDto; deleting: MutableRefObject<boolean>; onDeleted: () => void }) {
  const teamId = useTeamId()
  const del = useDeleteCard(teamId)
  const remove = () =>
    confirmAction({
      title: 'Delete card',
      message: `Delete ${card.key} "${card.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        deleting.current = true // the detail query will 404 once the card is gone; that is expected
        del.mutate(card.id, {
          onSuccess: () => {
            notifications.show({ color: 'green', message: `${card.key} deleted` })
            onDeleted()
          },
          onError: () => {
            deleting.current = false
          },
        })
      },
    })
  return (
    <div data-testid="card-danger">
      <Button color="red" variant="light" size="xs" leftSection={<IconTrash size={14} />} data-testid="card-delete" loading={del.isPending} onClick={remove}>
        Delete card
      </Button>
    </div>
  )
}
