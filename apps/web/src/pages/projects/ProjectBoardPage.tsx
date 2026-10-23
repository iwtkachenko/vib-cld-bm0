import {
  Alert, Badge, Box, Button, Group, MultiSelect, Paper, Skeleton, Stack, Switch, Text, TextInput, Title,
} from '@mantine/core'
import { IconAlertCircle, IconCircleCheck, IconPlus, IconSearch } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { DragDropContext, Draggable, Droppable, type DragStart, type DropResult } from '@hello-pangea/dnd'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import {
  canTransition, rankBetween, sortByRank, type CardDto, type CardTypeDto, type FlowDto, type ProjectDto, type StatusCategory, type StatusDef,
} from '@pm/shared'
import { qk, useCards, useProject, useTransitionCard } from '../../api/queries'
import { useActiveTeam } from '../../auth/hooks'
import { AssigneeAvatars, TypeBadge } from '../../components/common/badges'
import { EmptyState } from '../../components/common/EmptyState'
import { useTeamLookups } from '../../components/common/lookups'
import { matchesSearch } from '../../components/cards/cardFilters'
import { NewCardButton } from '../../components/cards/NewCardButton'
import { NewCardModal } from '../../components/cards/NewCardModal'
import { useCardModal } from '../../components/cards/useCardModal'
import { STATUS_CATEGORY_COLOR } from '../../utils/colors'

const COLUMN_WIDTH = 280

/** `${flowId}:${statusId}` — flow ids are hex and status ids never contain a colon. */
const columnId = (flowId: string, statusId: string) => `${flowId}:${statusId}`
function splitColumnId(id: string): [string, string] {
  const i = id.indexOf(':')
  return [id.slice(0, i), id.slice(i + 1)]
}

/** Rank between two neighbours, tolerating equal/inverted neighbours (should not happen, but never throw on a drop). */
function rankFor(prev: string | null, next: string | null): string {
  try {
    return rankBetween(prev, next)
  } catch {
    try {
      return rankBetween(prev, null)
    } catch {
      return rankBetween(null, null)
    }
  }
}

/** Optimistic placement applied on top of the cached list until the server answers. */
interface Override {
  token: number
  statusId: string
  statusCategory: StatusCategory
  rank: string
}

interface Dragging {
  flowId: string
  statusId: string
}

interface Section {
  flow: FlowDto
  types: (CardTypeDto | undefined)[]
  total: number
  /** status id → cards (filtered, ordered by rank) */
  columns: Map<string, CardDto[]>
}

export function ProjectBoardPage() {
  const { teamId, user } = useActiveTeam()
  const { projectId = '' } = useParams()
  const qc = useQueryClient()
  const projectQuery = useProject(teamId, projectId)
  const cardsQuery = useCards(teamId, { projectId })
  const lookups = useTeamLookups(teamId)
  const transition = useTransitionCard(teamId)
  const { open: openCard } = useCardModal()

  const [onlyMine, setOnlyMine] = useState(false)
  const [search, setSearch] = useState('')
  const [typeIds, setTypeIds] = useState<string[]>([])
  const [newCard, setNewCard] = useState<{ opened: boolean; typeId?: string }>({ opened: false })
  const [dragging, setDragging] = useState<Dragging | null>(null)
  const [overrides, setOverrides] = useState<Record<string, Override>>({})

  const project = projectQuery.data
  const archived = project?.state === 'archived'
  /** The cached list with in-flight drops applied. */
  const allCards = useMemo(
    () =>
      (cardsQuery.data ?? []).map((c) => {
        const o = overrides[c.id]
        return o ? { ...c, statusId: o.statusId, statusCategory: o.statusCategory, ranks: { ...c.ranks, [projectId]: o.rank } } : c
      }),
    [cardsQuery.data, overrides, projectId],
  )

  const sections = useMemo<Section[]>(() => {
    if (!project) return []
    const visible = allCards.filter(
      (c) =>
        (!onlyMine || c.assigneeIds.includes(user?.id)) &&
        (typeIds.length === 0 || typeIds.includes(c.typeId)) &&
        matchesSearch(c, search),
    )
    const flowIds: string[] = []
    for (const tf of project.typeFlows) if (!flowIds.includes(tf.flowId)) flowIds.push(tf.flowId)
    for (const c of allCards) if (!flowIds.includes(c.flowId)) flowIds.push(c.flowId)
    return flowIds
      .map((id) => lookups.flowsById.get(id))
      .filter((f): f is FlowDto => !!f)
      .map((flow) => {
        const inFlow = visible.filter((c) => c.flowId === flow.id)
        return {
          flow,
          types: project.typeFlows.filter((tf) => tf.flowId === flow.id).map((tf) => lookups.typesById.get(tf.cardTypeId)),
          total: allCards.filter((c) => c.flowId === flow.id).length,
          columns: new Map(flow.statuses.map((s) => [s.id, sortByRank(inFlow.filter((c) => c.statusId === s.id), projectId)])),
        }
      })
  }, [project, allCards, onlyMine, typeIds, search, user?.id, lookups.flowsById, lookups.typesById, projectId])

  const typeOptions = useMemo(() => {
    const ids = new Set<string>([...(project?.typeFlows.map((tf) => tf.cardTypeId) ?? []), ...allCards.map((c) => c.typeId)])
    return [...ids].flatMap((id) => {
      const t = lookups.typesById.get(id)
      return t ? [{ value: id, label: `${t.icon} ${t.name}` }] : []
    })
  }, [project, allCards, lookups.typesById])

  /* ------------------------------ drag and drop ------------------------------ */

  const onDragStart = (start: DragStart) => {
    const [flowId, statusId] = splitColumnId(start.source.droppableId)
    setDragging({ flowId, statusId })
  }

  const isColumnDisabled = (flow: FlowDto, statusId: string): boolean => {
    if (!dragging) return false
    if (dragging.flowId !== flow.id) return true
    if (dragging.statusId === statusId) return false // same column = reorder
    return !canTransition(flow, dragging.statusId, statusId)
  }

  const onDragEnd = (result: DropResult) => {
    setDragging(null)
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return
    const card = allCards.find((c) => c.id === draggableId)
    const section = sections.find((s) => s.flow.id === card?.flowId)
    const [destFlowId, destStatusId] = splitColumnId(destination.droppableId)
    if (!card || !section || section.flow.id !== destFlowId) return
    const toStatus = section.flow.statuses.find((s) => s.id === destStatusId)
    if (!toStatus) return
    if (toStatus.id !== card.statusId && !canTransition(section.flow, card.statusId, toStatus.id)) return

    // neighbours in the destination column as the user sees it, without the dragged card itself
    const column = (section.columns.get(toStatus.id) ?? []).filter((c) => c.id !== card.id)
    const prev = column[destination.index - 1]?.ranks[projectId] ?? null
    const next = column[destination.index]?.ranks[projectId] ?? null
    const rank = rankFor(prev, next)

    const original = (cardsQuery.data ?? []).find((c) => c.id === card.id) ?? card
    const toStatusId = toStatus.id
    const toCategory = toStatus.category
    const token = Date.now() + Math.random()
    const apply = (c: CardDto): CardDto => ({ ...c, statusId: toStatusId, statusCategory: toCategory, ranks: { ...c.ranks, [projectId]: rank } })

    // Synchronous (pangea calls us inside flushSync) so the card never snaps back for a frame.
    setOverrides((o) => ({ ...o, [original.id]: { token, statusId: toStatusId, statusCategory: toCategory, rank } }))
    void persist()

    async function persist() {
      const key = qk.team(teamId, 'cards', 'list', { projectId })
      await qc.cancelQueries({ queryKey: key })
      qc.setQueryData<CardDto[]>(key, (old) => old?.map((c) => (c.id === original.id ? apply(c) : c)))
      try {
        await transition.mutateAsync({
          id: original.id,
          body: { expectedStatusId: original.statusId, toStatusId, projectId, rank },
        })
      } catch (e) {
        // Roll back, but only if the cache still holds our optimistic placement: the mutation hook has normally
        // refetched by now, and that fresh server state (e.g. where someone else moved the card) must win.
        const stillOptimistic = (c: CardDto) => c.id === original.id && c.statusId === toStatusId && c.ranks[projectId] === rank
        qc.setQueryData<CardDto[]>(key, (old) => old?.map((c) => (stillOptimistic(c) ? original : c)))
        // The global mutation handler shows the server's message (409 = moved by someone else);
        // the hook has already queued a refetch so the board shows the real state.
        void e
      } finally {
        setOverrides((o) => {
          if (o[original.id]?.token !== token) return o
          const rest = { ...o }
          delete rest[original.id]
          return rest
        })
      }
    }
  }

  /* --------------------------------- render --------------------------------- */

  const loading = projectQuery.isPending || cardsQuery.isPending || lookups.isLoading
  const failed = projectQuery.isError || cardsQuery.isError

  const toolbar = (
    <Group justify="space-between" align="flex-end" wrap="wrap" mb="md" gap="sm">
      <Group gap="sm" wrap="wrap" align="flex-end">
        <TextInput
          aria-label="Search cards"
          placeholder="Search cards"
          data-testid="board-search"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          w={{ base: '100%', xs: 220 }}
        />
        <MultiSelect
          aria-label="Filter by type"
          placeholder={typeIds.length ? undefined : 'All types'}
          data-testid="board-type-filter"
          data={typeOptions}
          value={typeIds}
          onChange={setTypeIds}
          clearable
          w={{ base: '100%', xs: 240 }}
        />
        <Switch label="Only my cards" data-testid="board-only-mine" checked={onlyMine} onChange={(e) => setOnlyMine(e.currentTarget.checked)} pb={8} />
      </Group>
      <NewCardButton archived={!!archived} onClick={() => setNewCard({ opened: true })} />
    </Group>
  )

  let body: React.ReactNode
  if (failed) {
    body = (
      <Alert color="red" icon={<IconAlertCircle size={16} />} title="The board could not be loaded">
        <Group gap="sm">
          <Text size="sm">{(projectQuery.error ?? cardsQuery.error)?.message}</Text>
          <Button size="xs" variant="light" onClick={() => { void projectQuery.refetch(); void cardsQuery.refetch() }}>Retry</Button>
        </Group>
      </Alert>
    )
  } else if (loading) {
    body = (
      <Group wrap="nowrap" align="flex-start" gap="sm" style={{ overflow: 'hidden' }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} h={320} w={COLUMN_WIDTH} miw={COLUMN_WIDTH} radius="md" />
        ))}
      </Group>
    )
  } else if (sections.length === 0) {
    body = (
      <EmptyState
        title="No card types are mapped yet"
        text="Map card types to flows in the project settings to start adding cards to this board."
      />
    )
  } else {
    body = (
      <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <Stack gap="xl">
          {sections.map((section) => (
            <FlowSection
              key={section.flow.id}
              section={section}
              project={project!}
              projectId={projectId}
              dragging={dragging}
              isColumnDisabled={isColumnDisabled}
              members={lookups.membersById}
              typesById={lookups.typesById}
              projectsById={lookups.projectsById}
              onOpen={openCard}
              onCreate={() => setNewCard({ opened: true, typeId: section.types.find((t) => t && !t.archived)?.id })}
              archived={!!archived}
            />
          ))}
        </Stack>
      </DragDropContext>
    )
  }

  return (
    <>
      {toolbar}
      {body}
      <NewCardModal opened={newCard.opened} onClose={() => setNewCard((s) => ({ ...s, opened: false }))} projectId={projectId} defaultTypeId={newCard.typeId} />
    </>
  )
}

/* -------------------------------------------------------------------------- */

type Lookups = ReturnType<typeof useTeamLookups>

interface FlowSectionProps {
  section: Section
  project: ProjectDto
  projectId: string
  dragging: Dragging | null
  isColumnDisabled: (flow: FlowDto, statusId: string) => boolean
  members: Lookups['membersById']
  typesById: Lookups['typesById']
  projectsById: Lookups['projectsById']
  onOpen: (cardId: string) => void
  onCreate: () => void
  archived: boolean
}

function FlowSection({ section, project, projectId, dragging, isColumnDisabled, members, typesById, projectsById, onOpen, onCreate, archived }: FlowSectionProps) {
  const { flow, types, total, columns } = section
  const mapped = types.filter((t): t is CardTypeDto => !!t)
  return (
    <Stack gap="xs" data-testid={`board-section-${flow.id}`}>
      <Group gap="xs" wrap="wrap">
        <Title order={4}>{flow.name}</Title>
        {mapped.map((t) => (
          <TypeBadge key={t.id} type={t} size="xs" />
        ))}
        {mapped.length === 0 && project.typeFlows.length > 0 && (
          <Text size="xs" c="dimmed">cards from other projects</Text>
        )}
      </Group>

      {total === 0 ? (
        <Paper withBorder radius="md" p="lg" data-testid="board-section-empty">
          <Group justify="space-between" wrap="wrap">
            <Text c="dimmed" size="sm">No cards yet — create the first one</Text>
            {!archived && mapped.length > 0 && (
              <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={onCreate}>
                New card
              </Button>
            )}
          </Group>
        </Paper>
      ) : (
        <Box style={{ overflowX: 'auto', paddingBottom: 8 }} data-testid="board-scroll">
          <Group wrap="nowrap" align="flex-start" gap="sm" style={{ width: 'max-content', minWidth: '100%' }}>
            {flow.statuses.map((status) => (
              <BoardColumn
                key={status.id}
                flow={flow}
                status={status}
                cards={columns.get(status.id) ?? []}
                projectId={projectId}
                disabled={isColumnDisabled(flow, status.id)}
                dim={!!dragging && dragging.flowId === flow.id && isColumnDisabled(flow, status.id)}
                members={members}
                typesById={typesById}
                projectsById={projectsById}
                onOpen={onOpen}
              />
            ))}
          </Group>
        </Box>
      )}
    </Stack>
  )
}

interface BoardColumnProps {
  flow: FlowDto
  status: StatusDef
  cards: CardDto[]
  projectId: string
  disabled: boolean
  dim: boolean
  members: Lookups['membersById']
  typesById: Lookups['typesById']
  projectsById: Lookups['projectsById']
  onOpen: (cardId: string) => void
}

function BoardColumn({ flow, status, cards, projectId, disabled, dim, members, typesById, projectsById, onOpen }: BoardColumnProps) {
  const categoryColor = STATUS_CATEGORY_COLOR[status.category]
  return (
    <Droppable droppableId={columnId(flow.id, status.id)} type={flow.id} isDropDisabled={disabled}>
      {(provided, snapshot) => (
        <Paper
          withBorder
          radius="md"
          p="xs"
          w={COLUMN_WIDTH}
          miw={COLUMN_WIDTH}
          data-testid={`board-column-${status.id}`}
          data-flow-id={flow.id}
          data-category={status.category}
          data-drop-disabled={disabled || undefined}
          style={{
            flex: `0 0 ${COLUMN_WIDTH}px`,
            borderTop: `3px solid var(--mantine-color-${categoryColor}-6)`,
            background: snapshot.isDraggingOver ? 'var(--mantine-color-default-hover)' : 'var(--mantine-color-body)',
            opacity: dim ? 0.4 : 1,
            transition: 'opacity 120ms ease, background 120ms ease',
          }}
        >
          <Group justify="space-between" wrap="nowrap" mb="xs" gap="xs">
            <Text fw={600} size="sm" truncate title={status.name}>{status.name}</Text>
            <Badge size="sm" variant="light" color={categoryColor} data-testid={`board-count-${status.id}`}>{cards.length}</Badge>
          </Group>
          <Box ref={provided.innerRef} {...provided.droppableProps} mih={64} data-testid={`board-dropzone-${status.id}`}>
            {cards.map((card, index) => (
              <CardTile
                key={card.id}
                card={card}
                index={index}
                projectId={projectId}
                members={members}
                type={typesById.get(card.typeId)}
                primaryProjectName={card.primaryProjectId !== projectId ? (projectsById.get(card.primaryProjectId)?.name ?? 'another project') : undefined}
                onOpen={onOpen}
              />
            ))}
            {provided.placeholder}
            {cards.length === 0 && !snapshot.isDraggingOver && (
              <Text size="xs" c="dimmed" ta="center" py="sm">No cards</Text>
            )}
          </Box>
        </Paper>
      )}
    </Droppable>
  )
}

interface CardTileProps {
  card: CardDto
  index: number
  projectId: string
  members: Lookups['membersById']
  type: CardTypeDto | undefined
  /** Set when the card's primary project is another one (it is only linked here). */
  primaryProjectName: string | undefined
  onOpen: (cardId: string) => void
}

function CardTile({ card, index, members, type, primaryProjectName, onOpen }: CardTileProps) {
  const done = card.statusCategory === 'done'
  return (
    <Draggable draggableId={card.id} index={index}>
      {(provided, snapshot) => (
        <Paper
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          withBorder
          radius="md"
          p="xs"
          mb={8}
          shadow={snapshot.isDragging ? 'lg' : 'xs'}
          data-testid="card-tile"
          data-card-id={card.id}
          data-card-key={card.key}
          data-done={done || undefined}
          aria-label={`${card.key}: ${card.title}`}
          onClick={() => onOpen(card.id)}
          onKeyDown={(e: React.KeyboardEvent) => {
            // Space lifts a card (pangea); Enter opens it
            if (e.key === 'Enter' && !snapshot.isDragging) {
              e.preventDefault()
              onOpen(card.id)
            }
          }}
          style={{
            ...provided.draggableProps.style,
            cursor: 'pointer',
            opacity: done && !snapshot.isDragging ? 0.8 : 1,
            borderColor: snapshot.isDragging ? 'var(--mantine-primary-color-filled)' : undefined,
          }}
        >
          <Group gap={4} wrap="nowrap">
            {done && <IconCircleCheck size={14} color="var(--mantine-color-green-6)" aria-label="Done" />}
            <Text size="xs" c="dimmed" fw={600}>{card.key}</Text>
          </Group>
          <Text size="sm" fw={500} lineClamp={3} mt={2} c={done ? 'dimmed' : undefined} td={done ? 'line-through' : undefined}>
            {card.title}
          </Text>
          <Group gap={6} mt={6} justify="space-between" wrap="nowrap" align="center">
            <Group gap={4} wrap="wrap" miw={0}>
              <TypeBadge type={type} size="xs" />
              {primaryProjectName && (
                <Badge size="xs" variant="outline" color="gray" style={{ textTransform: 'none' }} data-testid="card-from-badge" maw={150}>
                  from {primaryProjectName}
                </Badge>
              )}
            </Group>
            <AssigneeAvatars ids={card.assigneeIds} members={members} size={22} />
          </Group>
        </Paper>
      )}
    </Draggable>
  )
}
