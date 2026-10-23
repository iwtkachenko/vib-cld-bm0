import { Checkbox, NumberInput, Select, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { IconCalendar } from '@tabler/icons-react'
import { useState } from 'react'
import type { FieldDef, FieldValue } from '@pm/shared'

export interface CustomFieldInputProps {
  def: FieldDef
  value: FieldValue | undefined
  /** Every edit (draft). */
  onChange: (value: FieldValue) => void
  /** Persist point: on blur for text/number, immediately for select/date/checkbox. */
  onCommit?: (value: FieldValue) => void
  error?: string
  disabled?: boolean
  withAsterisk?: boolean
  size?: 'xs' | 'sm' | 'md'
}

/** One input per custom-field kind (text / number / select / date / checkbox). `null` means "empty". */
export function CustomFieldInput({ def, value, onChange, onCommit, error, disabled, withAsterisk, size = 'sm' }: CustomFieldInputProps) {
  const testId = `field-${def.id}`
  switch (def.kind) {
    case 'text':
      return (
        <TextInput
          label={def.name} size={size} maxLength={2000} disabled={disabled} error={error} withAsterisk={withAsterisk} data-testid={testId}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.currentTarget.value)}
          onBlur={(e) => onCommit?.(e.currentTarget.value)}
        />
      )
    case 'number':
      return <NumberField def={def} value={value} onChange={onChange} onCommit={onCommit} error={error} disabled={disabled} withAsterisk={withAsterisk} size={size} />
    case 'select': {
      const current = typeof value === 'string' ? value : null
      const options = def.options ?? []
      return (
        <Select
          label={def.name} size={size} clearable disabled={disabled} error={error} withAsterisk={withAsterisk} data-testid={testId}
          placeholder="Select…"
          data={current && !options.includes(current) ? [...options, current] : options}
          value={current}
          onChange={(v) => {
            onChange(v)
            onCommit?.(v)
          }}
        />
      )
    }
    case 'date':
      return (
        <DatePickerInput
          label={def.name} size={size} clearable disabled={disabled} error={error} withAsterisk={withAsterisk} data-testid={testId}
          placeholder="Pick a date" valueFormat="MMM D, YYYY" leftSection={<IconCalendar size={16} />}
          value={typeof value === 'string' ? value : null}
          onChange={(v) => {
            onChange(v)
            onCommit?.(v)
          }}
        />
      )
    case 'checkbox':
      return (
        <Checkbox
          label={def.name} size={size} disabled={disabled} error={error} data-testid={testId}
          checked={value === true}
          onChange={(e) => {
            onChange(e.currentTarget.checked)
            onCommit?.(e.currentTarget.checked)
          }}
        />
      )
  }
}

/** NumberInput keeps partial input ("1.", "-") as a string, so it needs its own raw state next to the numeric value. */
function NumberField({ def, value, onChange, onCommit, error, disabled, withAsterisk, size }: CustomFieldInputProps) {
  const toRaw = (v: FieldValue | undefined): number | string => (typeof v === 'number' ? v : '')
  const [raw, setRaw] = useState<number | string>(toRaw(value))
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if (value !== (typeof raw === 'number' ? raw : null)) setRaw(toRaw(value))
  }
  const parsed = (v: number | string): FieldValue => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return (
    <NumberInput
      label={def.name} size={size} disabled={disabled} error={error} withAsterisk={withAsterisk} data-testid={`field-${def.id}`}
      value={raw}
      onChange={(v) => {
        setRaw(v)
        onChange(parsed(v))
      }}
      onBlur={() => onCommit?.(parsed(raw))}
    />
  )
}
