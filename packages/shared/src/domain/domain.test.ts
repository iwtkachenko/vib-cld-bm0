import { describe, expect, it } from 'vitest'
import {
  addDays, allTransitions, allowedTargets, buildBurnup, canTransition, cardKey, compareRank, createProjectInput,
  deriveTeamKey, endDateFor, flowInput, isValidRank, linearTransitions, rankBetween, registerInput, remapStatus,
  rankAfter, renderNamePattern, sortByRank, templateInput, validateFieldValues, validateFlowDef,
} from '../index'
import type { FieldDef, StatusDef } from '../index'

const st = (id: string, category: StatusDef['category']): StatusDef => ({ id, name: id, category, color: 'gray' })
const basic = { statuses: [st('todo', 'todo'), st('doing', 'in_progress'), st('done', 'done')], initialStatusId: 'todo' }

describe('flow', () => {
  it('validates flow definitions', () => {
    expect(validateFlowDef({ ...basic, transitions: allTransitions(basic.statuses) })).toEqual([])
    expect(validateFlowDef({ statuses: [st('a', 'todo')], initialStatusId: 'a', transitions: [] }).join()).toMatch(/done/)
    expect(validateFlowDef({ ...basic, initialStatusId: 'nope', transitions: [] }).join()).toMatch(/Initial/)
    expect(validateFlowDef({ ...basic, transitions: [{ from: 'todo', to: 'ghost' }] }).join()).toMatch(/existing/)
    expect(validateFlowDef({ ...basic, transitions: [{ from: 'todo', to: 'todo' }] }).join()).toMatch(/itself/)
    expect(
      validateFlowDef({ statuses: [st('a', 'todo'), { ...st('a', 'done') }], initialStatusId: 'a', transitions: [] }).join(),
    ).toMatch(/Duplicate status id/)
  })
  it('builds presets and checks transitions', () => {
    expect(allTransitions(basic.statuses)).toHaveLength(6)
    const lin = { transitions: linearTransitions(basic.statuses) }
    expect(lin.transitions).toHaveLength(4)
    expect(canTransition(lin, 'todo', 'doing')).toBe(true)
    expect(canTransition(lin, 'todo', 'done')).toBe(false)
    expect(canTransition(lin, 'todo', 'todo')).toBe(false)
    expect(allowedTargets(lin, 'doing').sort()).toEqual(['done', 'todo'])
  })
  it('remaps statuses between flows', () => {
    const other = { statuses: [st('open', 'todo'), st('review', 'in_progress'), st('shipped', 'done')], initialStatusId: 'open' }
    expect(remapStatus(basic, 'doing', other).id).toBe('review')
    expect(remapStatus(basic, 'done', other).id).toBe('shipped')
    expect(remapStatus(basic, 'todo', basic).id).toBe('todo')
    const noProgress = { statuses: [st('open', 'todo'), st('shipped', 'done')], initialStatusId: 'open' }
    expect(remapStatus(basic, 'doing', noProgress).id).toBe('open')
  })
  it('flowInput surfaces domain issues', () => {
    const bad = flowInput.safeParse({ name: 'x', statuses: [st('a', 'todo')], initialStatusId: 'a', transitions: [] })
    expect(bad.success).toBe(false)
    const ok = flowInput.safeParse({ name: 'x', ...basic, transitions: allTransitions(basic.statuses) })
    expect(ok.success).toBe(true)
  })
})

describe('custom fields', () => {
  const defs: FieldDef[] = [
    { id: 'pts', name: 'Points', kind: 'number', required: true },
    { id: 'sev', name: 'Severity', kind: 'select', options: ['low', 'high'], required: false },
    { id: 'due', name: 'Due', kind: 'date', required: false },
    { id: 'ok', name: 'OK', kind: 'checkbox', required: false },
    { id: 'note', name: 'Note', kind: 'text', required: false },
  ]
  it('enforces required + kinds on create, drops unknown keys', () => {
    expect(validateFieldValues(defs, {}, { mode: 'create' })).toEqual({ ok: false, errors: { pts: 'Required' } })
    const r = validateFieldValues(defs, { pts: 3, sev: 'low', due: '2026-02-28', ok: true, note: 'hi', ghost: 1 }, { mode: 'create' })
    expect(r).toEqual({ ok: true, values: { pts: 3, sev: 'low', due: '2026-02-28', ok: true, note: 'hi' } })
    const bad = validateFieldValues(defs, { pts: 'x', sev: 'mid', due: '2026-02-30' }, { mode: 'create' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['due', 'pts', 'sev'])
  })
  it('on update validates only changed values and never enforces required', () => {
    const existing = { sev: 'legacy-option' }
    const r = validateFieldValues(defs, { sev: 'legacy-option', note: 'x' }, { mode: 'update', existing })
    expect(r).toEqual({ ok: true, values: { sev: 'legacy-option', note: 'x' } })
    expect(validateFieldValues(defs, { sev: 'mid' }, { mode: 'update', existing }).ok).toBe(false)
    const cleared = validateFieldValues(defs, { note: null }, { mode: 'update', existing: { note: 'x', pts: 1 } })
    expect(cleared).toEqual({ ok: true, values: { pts: 1 } })
  })
})

describe('templates & dates', () => {
  it('renders name patterns and end dates', () => {
    expect(renderNamePattern('Sprint {n} ({date})', { n: 4, date: '2026-03-02' })).toBe('Sprint 4 (2026-03-02)')
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02')
    expect(endDateFor('2026-03-02', 14)).toBe('2026-03-15')
    expect(endDateFor('2026-03-02', null)).toBeNull()
  })
  it('validates template blueprints against mapped types', () => {
    const a = 'a'.repeat(24)
    const b = 'b'.repeat(24)
    const f = 'c'.repeat(24)
    const ok = templateInput.safeParse({
      name: 'Sprint', namePattern: 'Sprint {n}', typeFlows: [{ cardTypeId: a, flowId: f }],
      blueprints: [{ id: 'bp1', typeId: a, title: 'Planning' }],
    })
    expect(ok.success).toBe(true)
    const bad = templateInput.safeParse({
      name: 'Sprint', typeFlows: [{ cardTypeId: a, flowId: f }], blueprints: [{ id: 'bp1', typeId: b, title: 'X' }],
    })
    expect(bad.success).toBe(false)
  })
  it('createProjectInput requires name+mappings unless a template is given', () => {
    expect(createProjectInput.safeParse({}).success).toBe(false)
    expect(createProjectInput.safeParse({ name: 'P' }).success).toBe(false)
    expect(createProjectInput.safeParse({ templateId: 'a'.repeat(24) }).success).toBe(true)
  })
})

describe('rank', () => {
  it('generates ordered keys and validates them', () => {
    const a = rankBetween(null, null)
    const b = rankBetween(a, null)
    const mid = rankBetween(a, b)
    expect([b, mid, a].sort(compareRank)).toEqual([a, mid, b])
    expect(isValidRank(a)).toBe(true)
    expect(isValidRank('!!')).toBe(false)
  })
  it('appends with jitter: ordered after the last key, valid, effectively unique', () => {
    const last = rankBetween(null, null)
    const keys = Array.from({ length: 500 }, () => rankAfter(last))
    expect(new Set(keys).size).toBe(500)
    for (const k of keys) {
      expect(k > last).toBe(true)
      expect(isValidRank(k)).toBe(true)
      expect(rankBetween(last, k) > last).toBe(true) // still usable as a neighbour
    }
    expect(isValidRank(rankAfter(null))).toBe(true)
  })
  it('sorts per project with number tie-break', () => {
    const cards: { number: number; ranks: Record<string, string> }[] = [
      { number: 3, ranks: { p: 'a1' } },
      { number: 1, ranks: { p: 'a1' } },
      { number: 2, ranks: { p: 'a0' } },
      { number: 4, ranks: {} },
    ]
    expect(sortByRank(cards, 'p').map((c) => c.number)).toEqual([2, 1, 3, 4])
  })
})

describe('burnup', () => {
  it('builds cumulative daily series in a time zone', () => {
    const items = [
      { addedAt: '2026-03-01T10:00:00Z', completedAt: '2026-03-03T10:00:00Z' },
      { addedAt: '2026-03-02T23:30:00Z', completedAt: null },
      { addedAt: '2026-02-20T10:00:00Z', completedAt: '2026-02-25T10:00:00Z' },
    ]
    const utc = buildBurnup(items, '2026-03-01', '2026-03-04', 'UTC')
    expect(utc.map((p) => [p.date, p.scope, p.done])).toEqual([
      ['2026-03-01', 2, 1], ['2026-03-02', 3, 1], ['2026-03-03', 3, 2], ['2026-03-04', 3, 2],
    ])
    // 23:30Z on Mar 2 is already Mar 3 in Berlin (UTC+1)
    const berlin = buildBurnup(items, '2026-03-01', '2026-03-04', 'Europe/Berlin')
    expect(berlin[1]).toEqual({ date: '2026-03-02', scope: 2, done: 1 })
    expect(berlin[2]).toEqual({ date: '2026-03-03', scope: 3, done: 2 })
    expect(buildBurnup(items, '2026-03-05', '2026-03-01')).toEqual([])
  })
})

describe('misc', () => {
  it('derives team keys', () => {
    expect(deriveTeamKey('Acme Corp')).toBe('AC')
    expect(deriveTeamKey('Platform')).toBe('PLAT')
    expect(deriveTeamKey('42')).toBe('T42')
    expect(deriveTeamKey('Ы')).toMatch(/^[A-Z][A-Z0-9]+$/)
    expect(cardKey('AC', 7)).toBe('AC-7')
  })
  it('normalizes emails on register', () => {
    const r = registerInput.parse({ email: '  Foo@Example.COM ', name: ' Foo ', password: 'longenough' })
    expect(r).toEqual({ email: 'foo@example.com', name: 'Foo', password: 'longenough' })
    expect(registerInput.safeParse({ email: 'nope', name: 'x', password: 'longenough' }).success).toBe(false)
  })
})
