import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { basicFlow, createTestApp, seedTeam, type TestApp, type TestUser } from './helpers'

let t: TestApp
let alice: TestUser
let mallory: TestUser
let a: Awaited<ReturnType<typeof seedTeam>>
let m: Awaited<ReturnType<typeof seedTeam>>
let aCard: any
let mCard: any
let mTemplate: any

beforeAll(async () => {
  t = await createTestApp()
  alice = await t.user('Alice').registerVerified()
  mallory = await t.user('Mallory').registerVerified()
  a = await seedTeam(alice)
  m = await seedTeam(mallory)
  aCard = (await alice.post(`${a.base}/cards`, { projectId: a.project.id, typeId: a.type.id, title: 'Alice card', fields: { pts: 1 } })).body
  mCard = (await mallory.post(`${m.base}/cards`, { projectId: m.project.id, typeId: m.type.id, title: 'Mallory card', fields: { pts: 1 } })).body
  mTemplate = (await mallory.post(`${m.base}/templates`, {
    name: 'Mallory sprint', namePattern: 'S{n}', typeFlows: [{ cardTypeId: m.type.id, flowId: m.flow.id }],
  })).body
})
afterAll(async () => { await t.close() })

const FAKE = 'a'.repeat(24)

describe('route-table isolation', () => {
  it('every /api/teams/:teamId/* route is 401 for anonymous and 404 for non-members, before validation', async () => {
    const teamRoutes = t.routes.filter((r) => r.url.startsWith('/api/teams/:teamId') && r.method !== 'HEAD' && r.method !== 'OPTIONS')
    expect(teamRoutes.length).toBeGreaterThan(40)
    const anon = t.user('Anon')
    for (const r of teamRoutes) {
      const url = r.url.replace(':teamId', a.teamId).replace(/:\w+/g, FAKE)
      const body = r.method === 'GET' || r.method === 'DELETE' ? undefined : {}
      const as = async (u: TestUser) => (await u.call(r.method as 'GET', url, body)).status
      expect(await as(anon), `${r.method} ${r.url} anonymous`).toBe(401)
      expect(await as(mallory), `${r.method} ${r.url} non-member`).toBe(404)
    }
  })

  it('a malformed team id is simply not found', async () => {
    expect((await alice.get('/api/teams/not-an-id/cards')).status).toBe(404)
    expect((await alice.get(`/api/teams/${FAKE}/cards`)).status).toBe(404)
  })

  it('never leaks other teams data through member routes either', async () => {
    expect((await alice.get(`${a.base}/cards/${mCard.id}`)).status).toBe(404)
    expect((await alice.get(`${a.base}/projects/${m.project.id}`)).status).toBe(404)
    expect((await alice.get(`${a.base}/flows/${m.flow.id}`)).status).toBe(404)
    expect((await alice.patch(`${a.base}/card-types/${m.type.id}`, { name: 'x', fields: [] })).status).toBe(404)
    expect((await alice.del(`${a.base}/cards/${mCard.id}`)).status).toBe(404)
    expect((await mallory.get(`${m.base}/cards/${mCard.id}`)).status).toBe(200)
    expect((await alice.get(`${a.base}/cards`)).body.map((c: any) => c.id)).toEqual([aCard.id])
  })
})

describe('foreign ids in request bodies are rejected (422)', () => {
  it('card creation', async () => {
    expect((await alice.post(`${a.base}/cards`, { projectId: m.project.id, typeId: a.type.id, title: 'x', fields: { pts: 1 } })).status).toBe(422)
    expect((await alice.post(`${a.base}/cards`, { projectId: a.project.id, typeId: m.type.id, title: 'x' })).status).toBe(422)
    expect((await alice.post(`${a.base}/cards`, { projectId: a.project.id, typeId: a.type.id, title: 'x', fields: { pts: 1 }, assigneeIds: [mallory.id] })).status).toBe(422)
  })
  it('card update, links and primary', async () => {
    expect((await alice.patch(`${a.base}/cards/${aCard.id}`, { assigneeIds: [mallory.id] })).status).toBe(422)
    expect((await alice.post(`${a.base}/cards/${aCard.id}/links`, { projectId: m.project.id })).status).toBe(422)
    expect((await alice.post(`${a.base}/cards/${aCard.id}/primary`, { projectId: m.project.id })).status).toBe(422)
    expect((await alice.post(`${a.base}/cards/${aCard.id}/transition`, { expectedStatusId: 'todo', toStatusId: 'doing', projectId: m.project.id, rank: 'a1' })).status).toBe(422)
  })
  it('project creation and editing', async () => {
    const mapping = (type: string, flow: string) => [{ cardTypeId: type, flowId: flow }]
    const create = (body: object) => alice.post(`${a.base}/projects`, body)
    expect((await create({ name: 'P', typeFlows: mapping(m.type.id, a.flow.id) })).status).toBe(422)
    expect((await create({ name: 'P', typeFlows: mapping(a.type.id, m.flow.id) })).status).toBe(422)
    expect((await create({ templateId: mTemplate.id })).status).toBe(422)
    expect((await create({ name: 'P', typeFlows: mapping(a.type.id, a.flow.id), cards: [{ cardId: mCard.id, mode: 'move' }] })).status).toBe(422)
    expect((await create({ name: 'P', typeFlows: mapping(a.type.id, a.flow.id), newCards: [{ typeId: m.type.id, title: 'x' }] })).status).toBe(422)
    expect((await alice.patch(`${a.base}/projects/${a.project.id}`, { typeFlows: mapping(a.type.id, m.flow.id) })).status).toBe(422)
    expect((await alice.post(`${a.base}/projects/${a.project.id}/complete`, { carryOverToProjectId: m.project.id })).status).toBe(422)
  })
  it('templates', async () => {
    expect((await alice.post(`${a.base}/templates`, { name: 'T', typeFlows: [{ cardTypeId: m.type.id, flowId: a.flow.id }] })).status).toBe(422)
    expect((await alice.post(`${a.base}/templates`, { name: 'T', typeFlows: [{ cardTypeId: a.type.id, flowId: m.flow.id }] })).status).toBe(422)
  })
  it('nothing leaked into the victim team', async () => {
    expect((await mallory.get(`${m.base}/cards`)).body.map((c: any) => c.id)).toEqual([mCard.id])
    expect((await mallory.get(`${m.base}/projects`)).body).toHaveLength(1)
    const mine = (await alice.get(`${a.base}/cards/${aCard.id}`)).body
    expect(mine.projectIds).toEqual([a.project.id])
    expect(mine.assigneeIds).toEqual([])
  })
})

describe('independent numbering per team', () => {
  it('numbers cards per team starting from 1', async () => {
    expect(aCard.number).toBe(1)
    expect(mCard.number).toBe(1)
    const second = await alice.post(`${a.base}/cards`, { projectId: a.project.id, typeId: a.type.id, title: 'Second', fields: { pts: 2 } })
    expect(second.body.number).toBe(2)
    expect(second.body.key).toBe(`${a.key}-2`)
  })
  it('keeps flows of the same name in different teams apart', async () => {
    const other = await alice.post(`${a.base}/flows`, basicFlow('Basic'))
    expect(other.status).toBe(201)
    expect((await mallory.get(`${m.base}/flows`)).body).toHaveLength(1)
  })
})
