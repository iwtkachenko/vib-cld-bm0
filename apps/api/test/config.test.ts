import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rankBetween } from '@pm/shared'
import { basicFlow, createTestApp, seedTeam, type TestApp, type TestUser } from './helpers'

let t: TestApp
let owner: TestUser
let s: Awaited<ReturnType<typeof seedTeam>>

beforeAll(async () => {
  t = await createTestApp()
  owner = await t.user('Config Owner').registerVerified()
  s = await seedTeam(owner)
})
afterAll(async () => { await t.close() })

const newCard = (body: object = {}) =>
  owner.post(`${s.base}/cards`, { projectId: s.project.id, typeId: s.type.id, title: 'Card', fields: { pts: 1 }, ...body })

describe('flows', () => {
  it('validates flow definitions', async () => {
    const noDone = { ...basicFlow('X'), statuses: [{ id: 'a', name: 'A', category: 'todo', color: 'gray' }], initialStatusId: 'a', transitions: [] }
    const r = await owner.post(`${s.base}/flows`, noDone)
    expect(r.status).toBe(400)
    expect(JSON.stringify(r.body)).toMatch(/done/)
    expect((await owner.post(`${s.base}/flows`, { ...basicFlow('X'), initialStatusId: 'ghost' })).status).toBe(400)
    expect((await owner.post(`${s.base}/flows`, { ...basicFlow('X'), transitions: [{ from: 'todo', to: 'nope' }] })).status).toBe(400)
  })

  it('refuses to drop a status that cards use and re-syncs categories', async () => {
    const flow = (await owner.post(`${s.base}/flows`, basicFlow('Evolving'))).body
    const type = (await owner.post(`${s.base}/card-types`, { name: 'Chore' })).body
    const project = (await owner.post(`${s.base}/projects`, { name: 'Evolve', typeFlows: [{ cardTypeId: type.id, flowId: flow.id }] })).body.project
    const card = (await owner.post(`${s.base}/cards`, { projectId: project.id, typeId: type.id, title: 'c' })).body
    await owner.post(`${s.base}/cards/${card.id}/transition`, { expectedStatusId: 'todo', toStatusId: 'doing' })

    // "doing" is in use → cannot be removed
    const without = { ...basicFlow('Evolving'), statuses: basicFlow('x').statuses.filter((x) => x.id !== 'doing'), transitions: [{ from: 'todo', to: 'done' }] }
    const blocked = await owner.patch(`${s.base}/flows/${flow.id}`, without)
    expect(blocked.status).toBe(409)
    expect((await owner.get(`${s.base}/flows/${flow.id}/usage`)).body).toMatchObject({ byStatus: { doing: 1 }, cardCount: 1, projectCount: 1 })

    // turning "doing" into a done status marks its card completed
    const asDone = basicFlow('Evolving')
    asDone.statuses = asDone.statuses.map((x) => (x.id === 'doing' ? { ...x, category: 'done' } : x))
    expect((await owner.patch(`${s.base}/flows/${flow.id}`, asDone)).status).toBe(200)
    const after = (await owner.get(`${s.base}/cards/${card.id}`)).body
    expect(after.statusCategory).toBe('done')
    expect(after.completedAt).toBeTruthy()

    // ...and back to in_progress clears it
    expect((await owner.patch(`${s.base}/flows/${flow.id}`, basicFlow('Evolving'))).status).toBe(200)
    const back = (await owner.get(`${s.base}/cards/${card.id}`)).body
    expect(back.statusCategory).toBe('in_progress')
    expect(back.completedAt).toBeNull()

    // in-use flows cannot be deleted
    expect((await owner.del(`${s.base}/flows/${flow.id}`)).status).toBe(409)
    const unused = (await owner.post(`${s.base}/flows`, basicFlow('Unused'))).body
    expect((await owner.del(`${s.base}/flows/${unused.id}`)).status).toBe(200)
  })
})

describe('card types and custom fields', () => {
  it('validates field definitions', async () => {
    const noOptions = await owner.post(`${s.base}/card-types`, { name: 'Bad', fields: [{ id: 'f', name: 'F', kind: 'select' }] })
    expect(noOptions.status).toBe(400)
    const dup = await owner.post(`${s.base}/card-types`, {
      name: 'Bad2', fields: [{ id: 'f', name: 'F', kind: 'text' }, { id: 'f', name: 'G', kind: 'text' }],
    })
    expect(dup.status).toBe(400)
  })

  it('enforces required fields at creation and validates kinds', async () => {
    const missing = await newCard({ fields: {} })
    expect(missing.status).toBe(422)
    expect(missing.body.error.details.fields).toEqual({ pts: 'Required' })
    expect((await newCard({ fields: { pts: 'many' } })).status).toBe(422)
    expect((await newCard({ fields: { pts: 3, sev: 'medium' } })).status).toBe(422)
    const ok = await newCard({ fields: { pts: 3, sev: 'high', unknown: 'dropped' } })
    expect(ok.status).toBe(201)
    expect(ok.body.fields).toEqual({ pts: 3, sev: 'high' })
  })

  it('validates only changed fields on update and lets values be cleared', async () => {
    const card = (await newCard({ fields: { pts: 5, sev: 'low' } })).body
    expect((await owner.patch(`${s.base}/cards/${card.id}`, { fields: { sev: 'nope' } })).status).toBe(422)
    const cleared = await owner.patch(`${s.base}/cards/${card.id}`, { fields: { sev: null } })
    expect(cleared.body.fields).toEqual({ pts: 5 })
    // removing the select option from the type must not block unrelated edits of old cards
    const type = (await owner.get(`${s.base}/card-types`)).body.find((x: any) => x.id === s.type.id)
    await owner.patch(`${s.base}/card-types/${s.type.id}`, {
      ...type, fields: type.fields.map((f: any) => (f.id === 'sev' ? { ...f, options: ['critical'] } : f)),
    })
    expect((await owner.patch(`${s.base}/cards/${card.id}`, { title: 'Still editable' })).status).toBe(200)
  })

  it('keeps field kinds immutable, and archives or protects types in use', async () => {
    const type = (await owner.get(`${s.base}/card-types`)).body.find((x: any) => x.id === s.type.id)
    const retyped = await owner.patch(`${s.base}/card-types/${s.type.id}`, {
      ...type, fields: type.fields.map((f: any) => (f.id === 'pts' ? { ...f, kind: 'text' } : f)),
    })
    expect(retyped.status).toBe(422)
    expect((await owner.del(`${s.base}/card-types/${s.type.id}`)).status).toBe(409)

    const spare = (await owner.post(`${s.base}/card-types`, { name: 'Spare' })).body
    const proj = (await owner.post(`${s.base}/projects`, { name: 'Spare project', typeFlows: [{ cardTypeId: spare.id, flowId: s.flow.id }] })).body.project
    expect((await owner.post(`${s.base}/card-types/${spare.id}/archive`)).body.archived).toBe(true)
    const onArchived = await owner.post(`${s.base}/cards`, { projectId: proj.id, typeId: spare.id, title: 'nope' })
    expect(onArchived.status).toBe(422)
    // archived types cannot be added to new mappings
    expect((await owner.post(`${s.base}/projects`, { name: 'X', typeFlows: [{ cardTypeId: spare.id, flowId: s.flow.id }] })).status).toBe(422)
    expect((await owner.post(`${s.base}/card-types/${spare.id}/unarchive`)).body.archived).toBe(false)
    expect((await owner.del(`${s.base}/projects/${proj.id}`)).status).toBe(200)
    expect((await owner.del(`${s.base}/card-types/${spare.id}`)).status).toBe(200)
  })
})

describe('cards', () => {
  it('numbers cards consecutively even under concurrency', async () => {
    const fresh = await seedTeam(owner)
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        owner.post(`${fresh.base}/cards`, { projectId: fresh.project.id, typeId: fresh.type.id, title: `Parallel ${i}`, fields: { pts: 1 } }),
      ),
    )
    expect(results.every((r) => r.status === 201)).toBe(true)
    const numbers = results.map((r) => r.body.number).sort((x, y) => x - y)
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(new Set(results.map((r) => r.body.key)).size).toBe(20)
    // appended cards got strictly increasing ranks in the project
    const list = (await owner.get(`${fresh.base}/cards?projectId=${fresh.project.id}`)).body
    const ranks = list.map((c: any) => c.ranks[fresh.project.id])
    expect(new Set(ranks).size).toBe(20)
  })

  it('moves cards through allowed transitions only, with optimistic concurrency', async () => {
    const card = (await newCard()).body
    expect(card.statusId).toBe('todo')
    expect(card.completedAt).toBeNull()
    const go = (to: string, expected: string, extra: object = {}) =>
      owner.post(`${s.base}/cards/${card.id}/transition`, { expectedStatusId: expected, toStatusId: to, ...extra })

    const skip = await go('done', 'todo')
    expect(skip.status).toBe(422)
    expect(skip.body.error.message).toMatch(/not allowed/)
    expect((await go('nowhere', 'todo')).status).toBe(422)

    const doing = await go('doing', 'todo')
    expect(doing.body).toMatchObject({ statusId: 'doing', statusCategory: 'in_progress', completedAt: null })
    // a stale board still thinks the card is in "todo"
    const stale = await go('doing', 'todo')
    expect(stale.status).toBe(409)
    expect(stale.body.error.details).toEqual({ currentStatusId: 'doing' })

    const done = await go('done', 'doing')
    expect(done.body.statusCategory).toBe('done')
    expect(done.body.completedAt).toBeTruthy()
    const reopened = await go('doing', 'done')
    expect(reopened.body.completedAt).toBeNull()
  })

  it('reorders within a column using validated ranks', async () => {
    const a = (await newCard({ title: 'A' })).body
    const b = (await newCard({ title: 'B' })).body
    const base = `${s.base}/cards/${b.id}/transition`
    const rank = `${a.ranks[s.project.id]}`
    const bad = await owner.post(base, { expectedStatusId: 'todo', toStatusId: 'todo', projectId: s.project.id, rank: '!!invalid!!' })
    expect(bad.status).toBe(422)
    expect((await owner.post(base, { expectedStatusId: 'todo', toStatusId: 'todo', rank })).status).toBe(422) // rank without project
    const before = rankBetween(null, rank) // a valid key that sorts before A
    const moved = await owner.post(base, { expectedStatusId: 'todo', toStatusId: 'todo', projectId: s.project.id, rank: before })
    expect(moved.status).toBe(200)
    expect(moved.body.ranks[s.project.id]).toBe(before)
  })

  it('filters the list and searches by key and title', async () => {
    const fresh = await seedTeam(owner)
    const mk = (title: string, extra: object = {}) =>
      owner.post(`${fresh.base}/cards`, { projectId: fresh.project.id, typeId: fresh.type.id, title, fields: { pts: 1 }, ...extra })
    const first = (await mk('Fix login (urgent)')).body
    await mk('Write docs', { assigneeIds: [owner.id] })
    await owner.post(`${fresh.base}/cards/${first.id}/transition`, { expectedStatusId: 'todo', toStatusId: 'doing' })
    const list = async (qs: string) => (await owner.get(`${fresh.base}/cards${qs}`)).body.map((c: any) => c.title)
    expect(await list('')).toEqual(['Fix login (urgent)', 'Write docs'])
    expect(await list('?q=LOGIN')).toEqual(['Fix login (urgent)'])
    expect(await list('?q=(urgent')).toEqual(['Fix login (urgent)']) // regex chars are escaped
    expect(await list(`?q=${fresh.key}-2`)).toEqual(['Write docs'])
    expect(await list('?q=2')).toEqual(['Write docs'])
    expect(await list(`?assigneeId=${owner.id}`)).toEqual(['Write docs'])
    expect(await list('?statusCategory=in_progress')).toEqual(['Fix login (urgent)'])
    expect(await list(`?typeId=${fresh.type.id}&projectId=${fresh.project.id}&limit=1`)).toHaveLength(1)
    const summary = (await owner.get(`${fresh.base}/cards`)).body[0]
    expect(summary.body).toBeUndefined()
    expect((await owner.get(`${fresh.base}/cards/${summary.id}`)).body.body).toBe('')
  })

  it('updates title, body and assignees; deletes', async () => {
    const card = (await newCard()).body
    const updated = await owner.patch(`${s.base}/cards/${card.id}`, { title: 'Renamed', body: '# Heading\n\n- [ ] todo' })
    expect(updated.body).toMatchObject({ title: 'Renamed', body: '# Heading\n\n- [ ] todo' })
    expect((await owner.patch(`${s.base}/cards/${card.id}`, { title: '   ' })).status).toBe(400)
    expect((await owner.del(`${s.base}/cards/${card.id}`)).status).toBe(200)
    expect((await owner.get(`${s.base}/cards/${card.id}`)).status).toBe(404)
  })
})
