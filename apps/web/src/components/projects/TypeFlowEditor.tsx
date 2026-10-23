import { ActionIcon, Button, Group, Select, Stack, Text } from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { CardTypeDto, FlowDto, TypeFlow } from '@pm/shared'

export interface TypeFlowEditorProps {
  value: TypeFlow[]
  onChange: (next: TypeFlow[]) => void
  types: CardTypeDto[]
  flows: FlowDto[]
  /** Card types whose mapping cannot be removed (e.g. cards of that type have this project as primary). */
  lockedTypeIds?: Set<string>
  disabled?: boolean
}

/**
 * Edits a project/template mapping "card type → flow". Archived types stay visible only when already mapped.
 * Each card type can be mapped once.
 */
export function TypeFlowEditor({ value, onChange, types, flows, lockedTypeIds, disabled }: TypeFlowEditorProps) {
  const used = new Set(value.map((v) => v.cardTypeId))
  const typeOptions = (current: string) =>
    types.filter((t) => t.id === current || (!used.has(t.id) && !t.archived)).map((t) => ({ value: t.id, label: `${t.icon} ${t.name}` }))
  const flowOptions = flows.map((f) => ({ value: f.id, label: f.name }))
  const available = types.filter((t) => !used.has(t.id) && !t.archived)

  const set = (i: number, patch: Partial<TypeFlow>) => onChange(value.map((v, idx) => (idx === i ? { ...v, ...patch } : v)))

  return (
    <Stack gap="xs">
      {value.length === 0 && <Text size="sm" c="dimmed">No card types mapped yet.</Text>}
      {value.map((row, i) => (
        <Group key={row.cardTypeId || `new-${i}`} gap="xs" wrap="nowrap" align="flex-end">
          <Select
            label={i === 0 ? 'Card type' : undefined} aria-label="Card type" placeholder="Card type" style={{ flex: 1 }}
            data={typeOptions(row.cardTypeId)} value={row.cardTypeId || null} disabled={disabled || lockedTypeIds?.has(row.cardTypeId)}
            onChange={(v) => v && set(i, { cardTypeId: v })} allowDeselect={false}
          />
          <Select
            label={i === 0 ? 'Flow' : undefined} aria-label="Flow" placeholder="Flow" style={{ flex: 1 }}
            data={flowOptions} value={row.flowId || null} disabled={disabled}
            onChange={(v) => v && set(i, { flowId: v })} allowDeselect={false}
          />
          <ActionIcon
            variant="subtle" color="red" aria-label="Remove mapping" disabled={disabled || lockedTypeIds?.has(row.cardTypeId)}
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      ))}
      <Group>
        <Button
          size="xs" variant="light" leftSection={<IconPlus size={14} />} disabled={disabled || available.length === 0 || flows.length === 0}
          onClick={() => onChange([...value, { cardTypeId: available[0]!.id, flowId: flows[0]!.id }])}
        >
          Add card type
        </Button>
        {flows.length === 0 && <Text size="xs" c="dimmed">Create a flow first.</Text>}
        {flows.length > 0 && types.length === 0 && <Text size="xs" c="dimmed">Create a card type first.</Text>}
      </Group>
    </Stack>
  )
}
