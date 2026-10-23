import {
  ActionIcon, Alert, Badge, Button, Checkbox, Divider, Group, Loader, Modal, Paper, Select, SimpleGrid, Stack, Stepper, Text, TextInput, Textarea, Title,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react'
import { useQueries } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { endDateFor, renderNamePattern } from '@pm/shared'
import type { CardDto, CardTypeDto, CreateProjectBody, TypeFlow } from '@pm/shared'
import { teamApi } from '../../api/endpoints'
import { qk, useCardTypes, useCards, useCreateProject, useFlows, useTemplates, useUpdateProject } from '../../api/queries'
import { useTeamId } from '../../auth/hooks'
import { formatDate, todayString } from '../../utils/format'
import { TypeBadge } from '../common/badges'
import { TypeFlowEditor } from './TypeFlowEditor'

export interface NewProjectWizardProps {
  opened: boolean
  onClose: () => void
  /** Pre-select this template in step 1. */
  initialTemplateId?: string | null
  /** Existing cards to include in the new project (default mode in the UI is the given one). */
  preselectedCards?: { cardId: string; mode: 'link' | 'move' }[]
}

const BLANK = '__blank__'
const STEPS = ['Basics', 'Cards', 'Review'] as const

type Mode = 'link' | 'move'
interface ExistingCard { cardId: string; mode: Mode }
interface QuickCard { key: number; typeId: string; title: string }

/**
 * Three-step "new project" wizard (basics + mapping, cards, review). All state lives in an inner component that is
 * re-mounted every time the modal opens, so each opening starts from scratch.
 */
export function NewProjectWizard(props: NewProjectWizardProps) {
  const isMobile = useMediaQuery('(max-width: 48em)')
  const [wasOpened, setWasOpened] = useState(false)
  const [session, setSession] = useState(0)
  if (props.opened !== wasOpened) {
    setWasOpened(props.opened)
    if (props.opened) setSession((s) => s + 1)
  }
  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="New project"
      size={860}
      fullScreen={!!isMobile}
      centered={!isMobile}
      closeOnClickOutside={false}
    >
      <WizardBody key={session} onClose={props.onClose} initialTemplateId={props.initialTemplateId} preselectedCards={props.preselectedCards} />
    </Modal>
  )
}

function WizardBody({ onClose, initialTemplateId, preselectedCards }: Omit<NewProjectWizardProps, 'opened'>) {
  const teamId = useTeamId()
  const navigate = useNavigate()
  const templatesQ = useTemplates(teamId)
  const typesQ = useCardTypes(teamId)
  const flowsQ = useFlows(teamId)
  const create = useCreateProject(teamId)
  const update = useUpdateProject(teamId)

  const templates = templatesQ.data ?? []
  const types = typesQ.data ?? []
  const flows = flowsQ.data ?? []
  const typesById = new Map(types.map((t) => [t.id, t]))
  const flowsById = new Map(flows.map((f) => [f.id, f]))

  const [step, setStep] = useState(0)
  const [showErrors, setShowErrors] = useState(false)

  // Step 1. "Override" state is null/undefined until the user edits the field; until then values follow the template.
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId ?? null)
  const [nameOverride, setNameOverride] = useState<string | null>(null)
  const [descOverride, setDescOverride] = useState<string | null>(null)
  const [startOverride, setStartOverride] = useState<string | null | undefined>(undefined)
  const [endOverride, setEndOverride] = useState<string | null | undefined>(undefined)
  const [mapOverride, setMapOverride] = useState<TypeFlow[] | null>(null)

  // Step 2.
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
  const [quickCards, setQuickCards] = useState<QuickCard[]>([])
  const [quickType, setQuickType] = useState<string | null>(null)
  const [quickTitle, setQuickTitle] = useState('')
  const quickKey = useRef(0)
  const [existing, setExisting] = useState<ExistingCard[]>(() => [
    ...new Map((preselectedCards ?? []).map((c) => [c.cardId, { cardId: c.cardId, mode: c.mode }] as const)).values(),
  ])
  const [known, setKnown] = useState<Record<string, CardDto>>({})
  const [search, setSearch] = useState('')
  const [pickerKey, setPickerKey] = useState(0)
  const [debouncedSearch] = useDebouncedValue(search.trim(), 250)

  const template = templateId ? templates.find((t) => t.id === templateId) : undefined
  const today = todayString()
  const startDate = startOverride !== undefined ? startOverride : template ? today : null
  const endDate = endOverride !== undefined ? endOverride : template ? endDateFor(startDate ?? today, template.durationDays) : null
  const derivedName = template ? renderNamePattern(template.namePattern, { n: template.projectsCreated + 1, date: startDate ?? today }) : ''
  const name = nameOverride ?? derivedName
  const description = descOverride ?? template?.description ?? ''
  const typeFlows = mapOverride ?? template?.typeFlows ?? []
  const mappedIds = new Set(typeFlows.map((tf) => tf.cardTypeId))

  const errors = {
    name: !name.trim() ? 'Name is required' : name.trim().length > 120 ? 'Name is too long (max 120 characters)' : null,
    mapping: typeFlows.length === 0 ? 'Map at least one card type to a flow' : null,
    dates: startDate && endDate && endDate < startDate ? 'End date is before the start date' : null,
  }
  const step0Valid = !errors.name && !errors.mapping && !errors.dates

  // Cards the project will contain.
  const blueprints = template?.blueprints ?? []
  const activeBlueprints = blueprints.filter((b) => !unchecked.has(b.id) && mappedIds.has(b.typeId))
  const effectiveNew = quickCards.filter((c) => mappedIds.has(c.typeId))
  const mappedTypeOptions = types.filter((t) => mappedIds.has(t.id)).map((t) => ({ value: t.id, label: `${t.icon} ${t.name}` }))
  const quickTypeId = quickType && mappedIds.has(quickType) ? quickType : (mappedTypeOptions[0]?.value ?? null)

  // Existing cards: search results (server side) + preselected cards resolved by id.
  const searchQ = useCards(teamId, { q: debouncedSearch || undefined, limit: 20 }, step === 1)
  const preIds = useRef(existing.map((e) => e.cardId)).current
  const preQueries = useQueries({
    queries: preIds.map((id) => ({ queryKey: qk.team(teamId, 'cards', 'detail', id), queryFn: () => teamApi(teamId).cards.get(id) })),
  })
  const preLoading = preQueries.some((q) => q.isPending)
  const cardOf = (id: string): CardDto | undefined => known[id] ?? preQueries[preIds.indexOf(id)]?.data
  const canMove = (id: string) => {
    const c = cardOf(id)
    return !c || mappedIds.has(c.typeId)
  }
  const modeOf = (e: ExistingCard): Mode => (e.mode === 'move' && !canMove(e.cardId) ? 'link' : e.mode)
  const linkedCount = existing.filter((e) => modeOf(e) === 'link').length
  const movedCount = existing.filter((e) => modeOf(e) === 'move').length
  const totalCards = effectiveNew.length + activeBlueprints.length + existing.length

  const pickerOptions = (searchQ.data ?? [])
    .filter((c) => !existing.some((e) => e.cardId === c.id))
    .map((c) => ({ value: c.id, label: `${c.key} · ${c.title}` }))

  function selectTemplate(value: string | null) {
    const id = !value || value === BLANK ? null : value
    setTemplateId(id)
    setMapOverride(null)
    setDescOverride(null)
    setEndOverride(undefined)
    setUnchecked(new Set())
  }

  function addQuickCard() {
    const title = quickTitle.trim()
    if (!title || !quickTypeId) return
    quickKey.current += 1
    setQuickCards((cs) => [...cs, { key: quickKey.current, typeId: quickTypeId, title }])
    setQuickTitle('')
  }

  function addExisting(id: string) {
    const card = (searchQ.data ?? []).find((c) => c.id === id)
    if (card) setKnown((k) => ({ ...k, [id]: card }))
    setExisting((list) => (list.some((e) => e.cardId === id) ? list : [...list, { cardId: id, mode: 'link' }]))
    setSearch('')
    setPickerKey((k) => k + 1)
  }

  function next() {
    if (step === 0 && !step0Valid) {
      setShowErrors(true)
      return
    }
    setStep((s) => Math.min(2, s + 1))
  }

  async function submit() {
    if (!step0Valid) {
      setStep(0)
      setShowErrors(true)
      return
    }
    const body: CreateProjectBody = {
      templateId: template?.id,
      // Without an edited name the server renders the pattern itself, so {n} is always the real sequence number.
      name: nameOverride !== null || !template ? name.trim() : undefined,
      description: description.trim(),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      typeFlows,
      blueprintIds: template ? activeBlueprints.map((b) => b.id) : undefined,
      newCards: effectiveNew.map((c) => ({ typeId: c.typeId, title: c.title })),
      cards: existing.map((e) => ({ cardId: e.cardId, mode: modeOf(e) })),
    }
    const r = await create.mutateAsync(body)
    // A template fills in missing dates on the server; honour dates the user deliberately cleared.
    if (template && (startOverride === null || endOverride === null)) {
      const patch: { startDate?: null; endDate?: null } = {}
      if (startOverride === null) patch.startDate = null
      if (endOverride === null) patch.endDate = null
      try {
        await update.mutateAsync({ id: r.project.id, body: patch })
      } catch {
        // The failure notification is shown globally; the project itself exists.
      }
    }
    const count = r.created + r.linked + r.moved
    notifications.show({
      color: 'green',
      title: 'Project created',
      message: `${r.project.name} created${count > 0 ? ` with ${count} card${count === 1 ? '' : 's'}` : ''}`,
    })
    onClose()
    navigate(`/t/${teamId}/projects/${r.project.id}/board`)
  }

  const templateData = [{ value: BLANK, label: 'Blank project' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]

  return (
    <Stack gap="md">
      <Stepper active={step} size="sm" allowNextStepsSelect={false} onStepClick={setStep}>
        {STEPS.map((label) => (
          <Stepper.Step key={label} label={label} />
        ))}
      </Stepper>

      {step === 0 && (
        <Stack gap="sm" data-testid="wizard-step-basics">
          <Select
            label="Template"
            description={
              template
                ? `Prefills the card types, description, dates and name. Sequence number for {n}: ${template.projectsCreated + 1}.`
                : 'Start from scratch or from a saved blueprint.'
            }
            data={templateData}
            value={template ? template.id : BLANK}
            onChange={selectTemplate}
            allowDeselect={false}
            disabled={templatesQ.isPending}
            data-testid="wizard-template"
          />
          <TextInput
            label="Name"
            required
            value={name}
            onChange={(e) => setNameOverride(e.currentTarget.value)}
            error={showErrors ? errors.name : null}
            description={template && nameOverride === null ? `Generated from "${template.namePattern}". Edit to use your own name.` : undefined}
            data-autofocus
            data-testid="wizard-name"
          />
          <Textarea
            label="Description"
            autosize
            minRows={2}
            maxRows={6}
            value={description}
            onChange={(e) => setDescOverride(e.currentTarget.value)}
            data-testid="wizard-description"
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <DatePickerInput
              label="Start date"
              placeholder="Pick a date"
              clearable
              valueFormat="MMM D, YYYY"
              value={startDate}
              onChange={(v) => setStartOverride(v)}
              data-testid="wizard-start-date"
            />
            <DatePickerInput
              label="End date"
              placeholder="Pick a date"
              clearable
              valueFormat="MMM D, YYYY"
              minDate={startDate ?? undefined}
              value={endDate}
              onChange={(v) => setEndOverride(v)}
              error={showErrors ? errors.dates : null}
              data-testid="wizard-end-date"
            />
          </SimpleGrid>
          <div>
            <Text size="sm" fw={500}>Card types and flows</Text>
            <Text size="xs" c="dimmed" mb="xs">The project accepts only these card types; each type follows the flow chosen here.</Text>
            <TypeFlowEditor value={typeFlows} onChange={setMapOverride} types={types} flows={flows} />
            {showErrors && errors.mapping && <Text size="xs" c="red" mt={4} data-testid="wizard-mapping-error">{errors.mapping}</Text>}
          </div>
        </Stack>
      )}

      {step === 1 && (
        <Stack gap="lg" data-testid="wizard-step-cards">
          {template && (
            <section>
              <Group justify="space-between" mb="xs">
                <div>
                  <Title order={5}>Template cards</Title>
                  <Text size="xs" c="dimmed">Cards defined by “{template.name}”. Untick the ones you do not need.</Text>
                </div>
                {blueprints.length > 0 && (
                  <Group gap="xs">
                    <Button size="compact-xs" variant="subtle" onClick={() => setUnchecked(new Set())}>All</Button>
                    <Button size="compact-xs" variant="subtle" onClick={() => setUnchecked(new Set(blueprints.map((b) => b.id)))}>None</Button>
                  </Group>
                )}
              </Group>
              {blueprints.length === 0 ? (
                <Text size="sm" c="dimmed">This template has no cards.</Text>
              ) : (
                <Stack gap={6}>
                  {blueprints.map((b) => {
                    const mapped = mappedIds.has(b.typeId)
                    return (
                      <Checkbox
                        key={b.id}
                        checked={mapped && !unchecked.has(b.id)}
                        disabled={!mapped}
                        onChange={(e) => {
                          const on = e.currentTarget.checked
                          setUnchecked((prev) => {
                            const nextSet = new Set(prev)
                            if (on) nextSet.delete(b.id)
                            else nextSet.add(b.id)
                            return nextSet
                          })
                        }}
                        data-testid={`wizard-blueprint-${b.id}`}
                        label={
                          <Group gap="xs" wrap="wrap">
                            <TypeBadge type={typesById.get(b.typeId)} size="xs" />
                            <Text size="sm" span>{b.title}</Text>
                            {!mapped && <Text size="xs" c="red" span>type is not mapped in this project</Text>}
                          </Group>
                        }
                      />
                    )
                  })}
                </Stack>
              )}
            </section>
          )}

          <section>
            <Title order={5}>Add new cards</Title>
            <Text size="xs" c="dimmed" mb="xs">Quickly create cards that start in this project.</Text>
            {mappedTypeOptions.length === 0 ? (
              <Text size="sm" c="dimmed">Map a card type in step 1 to create cards.</Text>
            ) : (
              <Group align="flex-end" gap="xs" wrap="wrap">
                <Select
                  label="Type"
                  data={mappedTypeOptions}
                  value={quickTypeId}
                  onChange={setQuickType}
                  allowDeselect={false}
                  w={{ base: '100%', sm: 180 }}
                  data-testid="wizard-new-card-type"
                />
                <TextInput
                  label="Title"
                  placeholder="What needs to be done?"
                  style={{ flex: '1 1 200px' }}
                  value={quickTitle}
                  maxLength={200}
                  onChange={(e) => setQuickTitle(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addQuickCard()
                    }
                  }}
                  data-testid="wizard-new-card-title"
                />
                <Button variant="light" leftSection={<IconPlus size={14} />} disabled={!quickTitle.trim() || !quickTypeId} onClick={addQuickCard} data-testid="wizard-add-card">
                  Add
                </Button>
              </Group>
            )}
            {quickCards.length > 0 && (
              <Stack gap={6} mt="sm" data-testid="wizard-new-cards">
                {quickCards.map((c) => {
                  const mapped = mappedIds.has(c.typeId)
                  return (
                    <Paper key={c.key} withBorder p="xs" data-testid="wizard-new-card">
                      <Group justify="space-between" wrap="nowrap" gap="xs">
                        <Group gap="xs" wrap="wrap" style={{ minWidth: 0 }}>
                          <TypeBadge type={typesById.get(c.typeId)} size="xs" />
                          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>{c.title}</Text>
                          {!mapped && <Text size="xs" c="red">type is not mapped any more, this card will be skipped</Text>}
                        </Group>
                        <ActionIcon variant="subtle" color="red" aria-label={`Remove ${c.title}`} onClick={() => setQuickCards((cs) => cs.filter((x) => x.key !== c.key))}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Paper>
                  )
                })}
              </Stack>
            )}
          </section>

          <section>
            <Title order={5}>Existing cards</Title>
            <Text size="xs" c="dimmed" mb="xs">Link cards from other projects, or move them here so this project becomes their primary one.</Text>
            <Select
              key={pickerKey}
              placeholder="Search cards by title or key (e.g. PM-12)"
              aria-label="Search cards"
              searchable
              leftSection={<IconSearch size={14} />}
              rightSection={searchQ.isFetching ? <Loader size={14} /> : undefined}
              data={pickerOptions}
              value={null}
              searchValue={search}
              onSearchChange={setSearch}
              filter={({ options }) => options}
              onChange={(v) => v && addExisting(v)}
              nothingFoundMessage={searchQ.isPending ? 'Searching…' : 'No matching cards'}
              maxDropdownHeight={240}
              data-testid="wizard-card-search"
            />
            {existing.length > 0 && (
              <Stack gap={6} mt="sm" data-testid="wizard-existing-cards">
                {existing.map((e) => (
                  <ExistingCardRow
                    key={e.cardId}
                    card={cardOf(e.cardId)}
                    type={typesById.get(cardOf(e.cardId)?.typeId ?? '')}
                    mode={modeOf(e)}
                    canMove={canMove(e.cardId)}
                    onMode={(mode) => setExisting((list) => list.map((x) => (x.cardId === e.cardId ? { ...x, mode } : x)))}
                    onRemove={() => setExisting((list) => list.filter((x) => x.cardId !== e.cardId))}
                  />
                ))}
              </Stack>
            )}
          </section>
        </Stack>
      )}

      {step === 2 && (
        <Stack gap="sm" data-testid="wizard-step-review">
          <Paper withBorder p="md">
            <Stack gap="xs">
              <ReviewRow label="Name"><Text fw={600} data-testid="wizard-review-name" style={{ overflowWrap: 'anywhere' }}>{name.trim()}</Text></ReviewRow>
              <ReviewRow label="Template"><Text>{template ? template.name : 'Blank project'}</Text></ReviewRow>
              {description.trim() && <ReviewRow label="Description"><Text lineClamp={3} style={{ overflowWrap: 'anywhere' }}>{description.trim()}</Text></ReviewRow>}
              <ReviewRow label="Dates">
                <Text>{startDate || endDate ? `${startDate ? formatDate(startDate) : 'no start'} – ${endDate ? formatDate(endDate) : 'no end'}` : 'No dates'}</Text>
              </ReviewRow>
              <ReviewRow label="Card types">
                <Stack gap={4}>
                  {typeFlows.map((tf) => (
                    <Group key={tf.cardTypeId} gap="xs" wrap="wrap">
                      <TypeBadge type={typesById.get(tf.cardTypeId)} size="sm" />
                      <Text size="sm" c="dimmed">follows</Text>
                      <Badge variant="outline" color="gray" size="sm" style={{ textTransform: 'none' }}>{flowsById.get(tf.flowId)?.name ?? 'unknown flow'}</Badge>
                    </Group>
                  ))}
                </Stack>
              </ReviewRow>
              <Divider />
              <ReviewRow label="Cards">
                {totalCards === 0 ? (
                  <Text c="dimmed">The project starts empty.</Text>
                ) : (
                  <Stack gap={2} data-testid="wizard-review-cards">
                    {effectiveNew.length > 0 && <Text size="sm">{effectiveNew.length} new card{effectiveNew.length === 1 ? '' : 's'}</Text>}
                    {activeBlueprints.length > 0 && <Text size="sm">{activeBlueprints.length} card{activeBlueprints.length === 1 ? '' : 's'} from the template</Text>}
                    {linkedCount > 0 && <Text size="sm">{linkedCount} linked card{linkedCount === 1 ? '' : 's'}</Text>}
                    {movedCount > 0 && <Text size="sm">{movedCount} moved card{movedCount === 1 ? '' : 's'} (this project becomes their primary one)</Text>}
                  </Stack>
                )}
              </ReviewRow>
            </Stack>
          </Paper>
          {(effectiveNew.length < quickCards.length || activeBlueprints.length < blueprints.filter((b) => !unchecked.has(b.id)).length) && (
            <Alert color="yellow" variant="light" icon={<IconAlertCircle size={16} />}>
              Some cards are skipped because their card type is no longer mapped in this project.
            </Alert>
          )}
        </Stack>
      )}

      <Group justify="space-between" mt="xs">
        {step === 0 ? (
          <Button variant="default" onClick={onClose} data-testid="wizard-cancel">Cancel</Button>
        ) : (
          <Button variant="default" onClick={() => setStep((s) => Math.max(0, s - 1))} data-testid="wizard-back">Back</Button>
        )}
        {step < 2 ? (
          <Button onClick={next} data-testid="wizard-next">Next</Button>
        ) : (
          <Button onClick={() => void submit()} loading={create.isPending || update.isPending} disabled={preLoading} data-testid="wizard-create">
            Create project
          </Button>
        )}
      </Group>
    </Stack>
  )
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group align="flex-start" gap="md" wrap="wrap">
      <Text size="sm" c="dimmed" w={{ base: '100%', sm: 100 }} style={{ flexShrink: 0 }}>{label}</Text>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>{children}</div>
    </Group>
  )
}

function ExistingCardRow({
  card, type, mode, canMove, onMode, onRemove,
}: {
  card: CardDto | undefined
  type: CardTypeDto | undefined
  mode: Mode
  canMove: boolean
  onMode: (mode: Mode) => void
  onRemove: () => void
}) {
  return (
    <Paper withBorder p="xs" data-testid="wizard-existing-card" data-card-id={card?.id}>
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
        <Group gap="xs" wrap="wrap" style={{ flex: '1 1 200px', minWidth: 0 }}>
          {card ? (
            <>
              <Text size="sm" fw={600}>{card.key}</Text>
              <TypeBadge type={type} size="xs" />
              <Text size="sm" style={{ overflowWrap: 'anywhere' }}>{card.title}</Text>
            </>
          ) : (
            <Text size="sm" c="dimmed">Loading card…</Text>
          )}
        </Group>
        <Group gap="xs" wrap="nowrap" style={{ flex: '1 1 240px' }} justify="flex-end">
          <Select
            size="xs"
            aria-label="What to do with this card"
            allowDeselect={false}
            style={{ flex: 1 }}
            data={[
              { value: 'move', label: 'Move here (becomes primary)', disabled: !canMove },
              { value: 'link', label: 'Link only' },
            ]}
            value={mode}
            onChange={(v) => v && onMode(v as Mode)}
            data-testid="wizard-card-mode"
          />
          <ActionIcon variant="subtle" color="red" aria-label={`Remove ${card?.key ?? 'card'}`} onClick={onRemove}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>
      {!canMove && (
        <Text size="xs" c="dimmed" mt={4}>
          Moving is unavailable: type {type?.name ? `“${type.name}”` : 'of this card'} is not mapped in this project.
        </Text>
      )}
    </Paper>
  )
}
