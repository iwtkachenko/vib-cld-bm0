import { Alert, Button, Group, Select, Skeleton, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core'
import { IconAlertCircle, IconListDetails, IconSearch } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import type { CardDto, StatusCategory } from '@pm/shared'
import { useCards, useProject } from '../../api/queries'
import { useActiveTeam } from '../../auth/hooks'
import { AssigneeAvatars, StatusBadge, TypeBadge } from '../../components/common/badges'
import { EmptyState } from '../../components/common/EmptyState'
import { useTeamLookups } from '../../components/common/lookups'
import { matchesSearch } from '../../components/cards/cardFilters'
import { NewCardButton } from '../../components/cards/NewCardButton'
import { NewCardModal } from '../../components/cards/NewCardModal'
import { useCardModal } from '../../components/cards/useCardModal'
import { STATUS_CATEGORY_LABEL } from '../../utils/colors'
import { formatDateTime, fromNow } from '../../utils/format'

const CATEGORY_OPTIONS = (Object.keys(STATUS_CATEGORY_LABEL) as StatusCategory[]).map((c) => ({ value: c, label: STATUS_CATEGORY_LABEL[c] }))

export function ProjectListPage() {
  const { teamId, user } = useActiveTeam()
  const { projectId = '' } = useParams()
  const projectQuery = useProject(teamId, projectId)
  const cardsQuery = useCards(teamId, { projectId })
  const lookups = useTeamLookups(teamId)
  const { open: openCard } = useCardModal()

  const [search, setSearch] = useState('')
  const [typeId, setTypeId] = useState<string | null>(null)
  const [category, setCategory] = useState<StatusCategory | null>(null)
  const [assignee, setAssignee] = useState<string | null>(null)
  const [newCardOpen, setNewCardOpen] = useState(false)

  const archived = projectQuery.data?.state === 'archived'
  const cards = cardsQuery.data ?? []

  const rows = useMemo(
    () =>
      cards
        .filter(
          (c) =>
            matchesSearch(c, search) &&
            (!typeId || c.typeId === typeId) &&
            (!category || c.statusCategory === category) &&
            (!assignee ||
              (assignee === 'none' ? c.assigneeIds.length === 0 : assignee === 'me' ? c.assigneeIds.includes(user?.id) : c.assigneeIds.includes(assignee))),
        )
        .sort((a, b) => b.number - a.number),
    [cards, search, typeId, category, assignee, user?.id],
  )

  const typeOptions = useMemo(() => {
    const ids = new Set<string>([...(projectQuery.data?.typeFlows.map((tf) => tf.cardTypeId) ?? []), ...cards.map((c) => c.typeId)])
    return [...ids].flatMap((id) => {
      const t = lookups.typesById.get(id)
      return t ? [{ value: id, label: `${t.icon} ${t.name}` }] : []
    })
  }, [projectQuery.data, cards, lookups.typesById])

  const assigneeOptions = useMemo(
    () => [
      { value: 'me', label: 'Me' },
      { value: 'none', label: 'Unassigned' },
      ...lookups.members.filter((m) => m.userId !== user?.id).map((m) => ({ value: m.userId, label: m.name })),
    ],
    [lookups.members, user?.id],
  )

  const filtered = !!search.trim() || !!typeId || !!category || !!assignee
  const clearFilters = () => {
    setSearch('')
    setTypeId(null)
    setCategory(null)
    setAssignee(null)
  }

  const toolbar = (
    <Group justify="space-between" align="flex-end" wrap="wrap" mb="md" gap="sm">
      <Group gap="sm" wrap="wrap" align="flex-end">
        <TextInput
          aria-label="Search cards"
          placeholder="Search cards"
          data-testid="list-search"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          w={{ base: '100%', xs: 220 }}
        />
        <Select
          aria-label="Filter by type"
          placeholder="All types"
          data-testid="list-type-filter"
          data={typeOptions}
          value={typeId}
          onChange={setTypeId}
          clearable
          w={{ base: '100%', xs: 170 }}
        />
        <Select
          aria-label="Filter by status category"
          placeholder="Any status"
          data-testid="list-category-filter"
          data={CATEGORY_OPTIONS}
          value={category}
          onChange={(v) => setCategory(v as StatusCategory | null)}
          clearable
          w={{ base: '100%', xs: 170 }}
        />
        <Select
          aria-label="Filter by assignee"
          placeholder="Any assignee"
          data-testid="list-assignee-filter"
          data={assigneeOptions}
          value={assignee}
          onChange={setAssignee}
          searchable
          clearable
          w={{ base: '100%', xs: 190 }}
        />
      </Group>
      <NewCardButton archived={!!archived} onClick={() => setNewCardOpen(true)} />
    </Group>
  )

  let body: React.ReactNode
  if (projectQuery.isError || cardsQuery.isError) {
    body = (
      <Alert color="red" icon={<IconAlertCircle size={16} />} title="The cards could not be loaded">
        <Group gap="sm">
          <Text size="sm">{(projectQuery.error ?? cardsQuery.error)?.message}</Text>
          <Button size="xs" variant="light" onClick={() => { void projectQuery.refetch(); void cardsQuery.refetch() }}>Retry</Button>
        </Group>
      </Alert>
    )
  } else if (cardsQuery.isPending || projectQuery.isPending || lookups.isLoading) {
    body = (
      <Stack gap="xs">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} h={36} radius="sm" />
        ))}
      </Stack>
    )
  } else if (cards.length === 0) {
    body = (
      <EmptyState
        icon={<IconListDetails size={24} />}
        title="No cards yet"
        text="Create the first card of this project."
        action={!archived ? <Button onClick={() => setNewCardOpen(true)}>New card</Button> : undefined}
      />
    )
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon={<IconSearch size={24} />}
        title="No cards match your filters"
        action={<Button variant="light" onClick={clearFilters}>Clear filters</Button>}
      />
    )
  } else {
    body = (
      <>
        <Table.ScrollContainer minWidth={760} data-testid="list-scroll">
          <Table highlightOnHover verticalSpacing="xs" data-testid="card-list">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={100}>Key</Table.Th>
                <Table.Th>Title</Table.Th>
                <Table.Th w={150}>Type</Table.Th>
                <Table.Th w={150}>Status</Table.Th>
                <Table.Th w={120}>Assignees</Table.Th>
                <Table.Th w={130}>Updated</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((card) => (
                <CardRow
                  key={card.id}
                  card={card}
                  typeBadge={<TypeBadge type={lookups.typesById.get(card.typeId)} size="sm" />}
                  statusBadge={<StatusBadge status={lookups.statusOf(card.flowId, card.statusId)} size="sm" />}
                  members={lookups.membersById}
                  onOpen={openCard}
                />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Text size="xs" c="dimmed" mt="xs" data-testid="list-count">
          {filtered ? `${rows.length} of ${cards.length} cards` : `${cards.length} cards`}
        </Text>
      </>
    )
  }

  return (
    <>
      {toolbar}
      {body}
      <NewCardModal opened={newCardOpen} onClose={() => setNewCardOpen(false)} projectId={projectId} />
    </>
  )
}

interface CardRowProps {
  card: CardDto
  typeBadge: React.ReactNode
  statusBadge: React.ReactNode
  members: ReturnType<typeof useTeamLookups>['membersById']
  onOpen: (cardId: string) => void
}

function CardRow({ card, typeBadge, statusBadge, members, onOpen }: CardRowProps) {
  const done = card.statusCategory === 'done'
  return (
    <Table.Tr
      data-testid="list-row"
      data-card-id={card.id}
      data-card-key={card.key}
      tabIndex={0}
      aria-label={`Open ${card.key}: ${card.title}`}
      style={{ cursor: 'pointer' }}
      onClick={() => onOpen(card.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(card.id)
        }
      }}
    >
      <Table.Td>
        <Text size="sm" c="dimmed" fw={600} style={{ whiteSpace: 'nowrap' }}>{card.key}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm" fw={500} lineClamp={2} c={done ? 'dimmed' : undefined} td={done ? 'line-through' : undefined}>{card.title}</Text>
      </Table.Td>
      <Table.Td>{typeBadge}</Table.Td>
      <Table.Td>{statusBadge}</Table.Td>
      <Table.Td>
        {card.assigneeIds.length > 0 ? (
          <AssigneeAvatars ids={card.assigneeIds} members={members} size={24} />
        ) : (
          <Text size="xs" c="dimmed">Unassigned</Text>
        )}
      </Table.Td>
      <Table.Td>
        <Tooltip label={formatDateTime(card.updatedAt)} withArrow>
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{fromNow(card.updatedAt)}</Text>
        </Tooltip>
      </Table.Td>
    </Table.Tr>
  )
}
