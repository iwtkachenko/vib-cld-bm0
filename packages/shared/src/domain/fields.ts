import type { FieldDef, FieldValue, FieldValues } from '../types'

export type FieldValidation =
  | { ok: true; values: FieldValues }
  | { ok: false; errors: Record<string, string> }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || v === false
}

function check(def: FieldDef, v: unknown): { value: FieldValue } | { error: string } {
  if (v === null || v === undefined || v === '') return { value: null }
  switch (def.kind) {
    case 'text':
      return typeof v === 'string' ? { value: v } : { error: 'Expected text' }
    case 'number':
      return typeof v === 'number' && Number.isFinite(v) ? { value: v } : { error: 'Expected a number' }
    case 'select':
      return typeof v === 'string' && def.options?.includes(v) ? { value: v } : { error: 'Pick one of the options' }
    case 'date':
      return typeof v === 'string' && isValidDate(v) ? { value: v } : { error: 'Expected a date (YYYY-MM-DD)' }
    case 'checkbox':
      return typeof v === 'boolean' ? { value: v } : { error: 'Expected true or false' }
  }
}

/**
 * Validate custom field input against the card type's field definitions.
 * - unknown keys are dropped
 * - on update only fields whose value changed are validated (so schema evolution never blocks edits)
 * - `required` is enforced on create only
 */
export function validateFieldValues(
  defs: FieldDef[],
  input: Record<string, unknown>,
  opts: { mode: 'create' } | { mode: 'update'; existing: FieldValues },
): FieldValidation {
  const errors: Record<string, string> = {}
  const values: FieldValues = opts.mode === 'update' ? { ...opts.existing } : {}
  for (const def of defs) {
    const has = Object.prototype.hasOwnProperty.call(input, def.id)
    if (opts.mode === 'update') {
      if (!has) continue
      if (input[def.id] === (opts.existing[def.id] ?? null)) continue
    }
    if (has) {
      const r = check(def, input[def.id])
      if ('error' in r) errors[def.id] = r.error
      else if (r.value === null) delete values[def.id]
      else values[def.id] = r.value
    }
    if (opts.mode === 'create' && def.required && def.kind !== 'checkbox' && isEmpty(values[def.id])) {
      errors[def.id] = 'Required'
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values }
}
