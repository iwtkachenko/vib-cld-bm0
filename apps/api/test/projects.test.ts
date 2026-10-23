import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays, todayString } from '@pm/shared'
import { basicFlow, createTestApp, type TestApp, type TestUser } from './helpers'

let t: TestApp
let owner: TestUser
let teamId: string
let base: string
let basic: any
let dev: any
let task: any
let bug: any

const devFlow = () => ({
  name: 'Dev',
  statuses: [
    { id: 'backlog', name: 'Backlog', category: 'todo', color: 'gray' },
    { id: 'doing', name: 'Doing', category: 'in_progress', color: 'blue' },
    { id: 'review', name: 'Review', category: 'in_progress', color: 'violet' },
    { id: 'shipped', name: 'Shipped', category: 'done', color: 'green' },
  ],
  initialStatusId: 'backlog',
  transitions: [
    { from: 'backlog', to: 'doing' }, { from: 'doing', to: 'review' }, { from: 'review', to: 'shipped' },
    { from: 'review', to: 'doing' }, { from: 'doing', to: 'backlog' }, { from: 'shipped', to: 'review' },
  ],
})

beforeAll(async () => {
  t = await createTestApp()
  owner = await t.user('Pat Owner').registerVerified()
  const created = await owner.post('/api/teams', { name: 'Delivery' })
  teamId = created.body.team.id
  base = `/api/teams/${teamId}`
  basic = (await owner.post(`${base}/flows`, basicFlow('Basic'))).body
  dev = (await owner.post(`${base}/flows`, devFlow())).body
  task = (await owner.post(`${base}/card-types`, { name: 'Task', icon: '✅' })).body
  bug = (await owner.post(`${base}/card-types`, { name: 'Bug', icon: '🐞' })).body
})
afterAll(async () => { await t.close() })

const mapping = (flow: any, ...types: any[]) => types.map((x) => ({ cardTypeId: x.id, flowId: flow.id }))
const project = async (name: string, flow = basic, types = [task]) =>
  (await owner.post(`${base}/projects`, { name, typeFlows: mapping(flow, ...types) })).body.project
const card = async (p: any, title = 'Card', typeId = task.id, extra: object = {}) =>
  (await owner.post(`${base}/cards`, { projectId: p.id, typeId, title, ...extra })).body
const getCard = async (id: string) => (await owner.get(`${base}/cards/${id}`)).body
const move = (c: any, to: string, expected: string) =>
  owner.post(`${base}/cards/${c.id}/transition`, { expectedStatusId: expected, toStatusId: to })

describe('templates → projects', () => {
  let sprint: any
  beforeAll(async () => {
    sprint = (await owner.post(`${base}/templates`, {
      name: 'Sprint', namePattern: 'Sprint {n}', durationDays: 14, typeFlows: mapping(dev, task, bug),
      blueprints: [
        { id: 'b1', typeId: task.id, title: 'Sprint planning', body: '## Agenda\n\n- [ ] goals' },
        { id: 'b2', typeId: task.id, title: 'Retrospective' },
      ],
    })).body
  })

  it('creates a sprint with its blueprint cards right away', async () => {
    const r = await owner.post(`${base}/projects`, { templateId: sprint.id })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ created: 2, linked: 0, moved: 0 })
    const p = r.body.project
    expect(p).toMatchObject({ name: 'Sprint 1', state: 'active', startDate: todayString(), endDate: addDays(todayString(), 13), templateId: sprint.id })
    expect(p.typeFlows).toHaveLength(2)

    const cards = (await owner.get(`${base}/cards?projectId=${p.id}`)).body
    expect(cards.map((c: any) => c.title)).toEqual(['Sprint planning', 'Retrospective'])
    expect(cards.every((c: any) => c.primaryProjectId === p.id && c.flowId === dev.id && c.statusId === 'backlog')).toBe(true)
    expect(cards.map((c: any) => c.number)).toEqual([cards[0].number, cards[0].number + 1])
    expect(cards[0].ranks[p.id] < cards[1].ranks[p.id]).toBe(true)
    expect((await owner.get(`${base}/cards/${cards[0].id}`)).body.body).toBe('## Agenda\n\n- [ ] goals')

    const second = await owner.post(`${base}/projects`, { templateId: sprint.id, blueprintIds: ['b2'] })
    expect(second.body.project.name).toBe('Sprint 2')
    expect(second.body.created).toBe(1)
    const named = await owner.post(`${base}/projects`, { templateId: sprint.id, name: 'Hardening', startDate: '2026-01-05', endDate: '2026-01-09', blueprintIds: [] })
    expect(named.body.project).toMatchObject({ name: 'Hardening', startDate: '2026-01-05', endDate: '2026-01-09' })
    expect(named.body.created).toBe(0)
    expect((await owner.get(`${base}/templates`)).body.find((x: any) => x.id === sprint.id).projectsCreated).toBe(3)
  })

  it('adds ad-hoc new cards next to the blueprints', async () => {
    const r = await owner.post(`${base}/projects`, {
      templateId: sprint.id, blueprintIds: ['b1'], newCards: [{ typeId: bug.id, title: 'Known bug', assigneeIds: [owner.id] }],
    })
    expect(r.status).toBe(201)
    expect(r.body.created).toBe(2)
    const cards = (await owner.get(`${base}/cards?projectId=${r.body.project.id}`)).body
    expect(cards.map((c: any) => c.title).sort()).toEqual(['Known bug', 'Sprint planning'])
    expect(cards.find((c: any) => c.title === 'Known bug').assigneeIds).toEqual([owner.id])
  })

  it('is all-or-nothing', async () => {
    const [{ projectsCreated }, projectsBefore, lastCard] = await Promise.all([
      owner.get(`${base}/templates`).then((r) => r.body.find((x: any) => x.id === sprint.id)),
      owner.get(`${base}/projects`).then((r) => r.body.length),
      card(await project('Counter probe'), 'probe'),
    ])
    const unmapped = (await owner.post(`${base}/card-types`, { name: 'Epic' })).body
    const r = await owner.post(`${base}/projects`, { templateId: sprint.id, newCards: [{ typeId: unmapped.id, title: 'Cannot be created' }] })
    expect(r.status).toBe(422)
    expect((await owner.get(`${base}/templates`)).body.find((x: any) => x.id === sprint.id).projectsCreated).toBe(projectsCreated)
    expect((await owner.get(`${base}/projects`)).body.length).toBe(projectsBefore + 1) // only the probe project
    const next = await card(await project('Counter probe 2'), 'next')
    expect(next.number).toBe(lastCard.number + 1) // card numbers were rolled back as well
  })

  it('moves and links existing cards into the new project', async () => {
    const backlog = await project('Backlog', basic)
    const toMove = await card(backlog, 'Move me')
    const toLink = await card(backlog, 'Link me')
    await move(toMove, 'doing', 'todo')
    const r = await owner.post(`${base}/projects`, {
      templateId: sprint.id, blueprintIds: [], cards: [{ cardId: toMove.id, mode: 'move' }, { cardId: toLink.id, mode: 'link' }],
    })
    expect(r.body).toMatchObject({ created: 0, linked: 1, moved: 1 })
    const p = r.body.project

    const moved = await getCard(toMove.id)
    expect(moved).toMatchObject({ primaryProjectId: p.id, flowId: dev.id, statusId: 'doing', statusCategory: 'in_progress' })
    expect(moved.projectIds).toEqual([p.id]) // "move" leaves the previous project
    const linked = await getCard(toLink.id)
    expect(linked).toMatchObject({ primaryProjectId: backlog.id, flowId: basic.id })
    expect(linked.projectIds.sort()).toEqual([backlog.id, p.id].sort())
    expect(Object.keys(linked.ranks).sort()).toEqual([backlog.id, p.id].sort())
    // the linked card appears on both boards, the moved one only on the new board
    expect((await owner.get(`${base}/cards?projectId=${p.id}`)).body.map((c: any) => c.title).sort()).toEqual(['Link me', 'Move me'])
    expect((await owner.get(`${base}/cards?projectId=${backlog.id}`)).body.map((c: any) => c.title)).toEqual(['Link me'])
  })

  it('refuses to move a card whose type the new project does not map', async () => {
    const other = await project('Bugs only', basic, [bug])
    const b = await card(other, 'A bug', bug.id)
    const onlyTask = (await owner.post(`${base}/templates`, { name: 'Task only', typeFlows: mapping(dev, task) })).body
    const r = await owner.post(`${base}/projects`, { templateId: onlyTask.id, cards: [{ cardId: b.id, mode: 'move' }] })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toMatch(/Bug.*not mapped/)
    expect((await getCard(b.id)).primaryProjectId).toBe(other.id)
    // but linking is always possible
    expect((await owner.post(`${base}/projects`, { templateId: onlyTask.id, cards: [{ cardId: b.id, mode: 'link' }] })).status).toBe(201)
  })

  it('validates project input', async () => {
    expect((await owner.post(`${base}/projects`, {})).status).toBe(400)
    expect((await owner.post(`${base}/projects`, { name: 'No mapping' })).status).toBe(400)
    expect((await owner.post(`${base}/projects`, { name: 'Dates', typeFlows: mapping(basic, task), startDate: '2026-02-02', endDate: '2026-02-01' })).status).toBe(400)
    expect((await owner.post(`${base}/projects`, { name: 'Dup', typeFlows: [...mapping(basic, task), ...mapping(dev, task)] })).status).toBe(400)
  })
})

describe('primary vs linked projects', () => {
  it('lets a card live in several projects but follow its primary one', async () => {
    const a = await project('Roadmap', dev)
    const b = await project('Board B', basic)
    const c = await card(a, 'Shared')
    expect(c).toMatchObject({ flowId: dev.id, statusId: 'backlog' })

    const linked = await owner.post(`${base}/cards/${c.id}/links`, { projectId: b.id })
    expect(linked.body.projectIds).toEqual([a.id, b.id])
    expect(linked.body.primaryProjectId).toBe(a.id)
    expect(linked.body.flowId).toBe(dev.id) // linking never changes the flow
    expect((await owner.post(`${base}/cards/${c.id}/links`, { projectId: b.id })).body.projectIds).toHaveLength(2) // idempotent

    expect((await owner.del(`${base}/cards/${c.id}/links/${a.id}`)).status).toBe(422) // can't unlink the primary
    await move(c, 'doing', 'backlog')
    await owner.post(`${base}/cards/${c.id}/transition`, { expectedStatusId: 'doing', toStatusId: 'review' })

    // make B primary → basic flow; "review" does not exist there → first in_progress status
    const promoted = await owner.post(`${base}/cards/${c.id}/primary`, { projectId: b.id })
    expect(promoted.body).toMatchObject({ primaryProjectId: b.id, flowId: basic.id, statusId: 'doing', statusCategory: 'in_progress' })
    expect(promoted.body.projectIds).toEqual([a.id, b.id])

    const unlinked = await owner.del(`${base}/cards/${c.id}/links/${a.id}`)
    expect(unlinked.body.projectIds).toEqual([b.id])
    expect(Object.keys(unlinked.body.ranks)).toEqual([b.id])
    expect((await owner.del(`${base}/cards/${c.id}/links/${a.id}`)).status).toBe(404)
  })

  it('keeps done cards done (and completed) when the flow changes, and supports keepPreviousLink=false', async () => {
    const a = await project('Flow A', dev)
    const b = await project('Flow B', basic)
    const c = await card(a, 'Finished')
    await move(c, 'doing', 'backlog')
    await owner.post(`${base}/cards/${c.id}/transition`, { expectedStatusId: 'doing', toStatusId: 'review' })
    const done = (await owner.post(`${base}/cards/${c.id}/transition`, { expectedStatusId: 'review', toStatusId: 'shipped' })).body
    const moved = await owner.post(`${base}/cards/${c.id}/primary`, { projectId: b.id, keepPreviousLink: false })
    expect(moved.body).toMatchObject({ primaryProjectId: b.id, statusId: 'done', statusCategory: 'done', projectIds: [b.id] })
    expect(moved.body.completedAt).toBe(done.completedAt)
  })

  it('requires the target project to map the card type', async () => {
    const a = await project('Typed A', basic, [task, bug])
    const b = await project('Tasks only', basic, [task])
    const bg = await card(a, 'Bug', bug.id)
    const r = await owner.post(`${base}/cards/${bg.id}/primary`, { projectId: b.id })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toMatch(/Bug/)
    expect((await owner.post(`${base}/cards/${bg.id}/links`, { projectId: b.id })).status).toBe(200) // linking is fine
  })

  it('keeps independent rankings per project', async () => {
    const a = await project('Rank A')
    const b = await project('Rank B')
    const [c1, c2] = [await card(a, 'one'), await card(a, 'two')]
    await owner.post(`${base}/cards/${c2.id}/links`, { projectId: b.id })
    await owner.post(`${base}/cards/${c1.id}/links`, { projectId: b.id })
    const inA = (await owner.get(`${base}/cards?projectId=${a.id}`)).body
    const inB = (await owner.get(`${base}/cards?projectId=${b.id}`)).body
    const order = (list: any[], pid: string) => [...list].sort((x, y) => (x.ranks[pid] < y.ranks[pid] ? -1 : 1)).map((c) => c.title)
    expect(order(inA, a.id)).toEqual(['one', 'two'])
    expect(order(inB, b.id)).toEqual(['two', 'one']) // linked in the opposite order → its own ordering
  })
})

describe('project lifecycle', () => {
  it('remaps primary cards when a mapping changes and blocks unmapping types in use', async () => {
    const p = await project('Remap', basic, [task, bug])
    const c = await card(p, 'Remapped')
    await move(c, 'doing', 'todo')
    const r = await owner.patch(`${base}/projects/${p.id}`, { typeFlows: [...mapping(dev, task), ...mapping(basic, bug)] })
    expect(r.status).toBe(200)
    expect(await getCard(c.id)).toMatchObject({ flowId: dev.id, statusId: 'doing' })

    const unmapped = await owner.patch(`${base}/projects/${p.id}`, { typeFlows: mapping(basic, bug) })
    expect(unmapped.status).toBe(409)
    expect((await owner.patch(`${base}/projects/${p.id}`, { typeFlows: [...mapping(dev, task)] })).status).toBe(200) // Bug has no cards → removable
  })

  it('completes a sprint, carrying unfinished cards over, and freezes its stats', async () => {
    const sprintA = await project('Sprint A', dev)
    const next = await project('Sprint B', basic)
    const finished = await card(sprintA, 'Done one', task.id, { assigneeIds: [owner.id] })
    const open1 = await card(sprintA, 'Open 1')
    const open2 = await card(sprintA, 'Open 2', task.id, { assigneeIds: [owner.id] })
    for (const [to, from] of [['doing', 'backlog'], ['review', 'doing'], ['shipped', 'review']] as const) await move(finished, to, from)
    await move(open2, 'doing', 'backlog')

    const before = (await owner.get(`${base}/projects/${sprintA.id}/stats`)).body
    expect(before).toMatchObject({ total: 3, todo: 1, inProgress: 1, done: 1, completionPct: 33 })

    const done = await owner.post(`${base}/projects/${sprintA.id}/complete`, { carryOverToProjectId: next.id })
    expect(done.status).toBe(200)
    expect(done.body.carriedOver).toBe(2)
    expect(done.body.project).toMatchObject({ state: 'archived' })
    expect(done.body.project.completedAt).toBeTruthy()

    expect(await getCard(finished.id)).toMatchObject({ primaryProjectId: sprintA.id, statusCategory: 'done' })
    const carried = await getCard(open2.id)
    expect(carried).toMatchObject({ primaryProjectId: next.id, flowId: basic.id, statusId: 'doing' })
    expect(carried.projectIds.sort()).toEqual([sprintA.id, next.id].sort()) // history link is kept
    expect((await getCard(open1.id)).statusId).toBe('todo') // backlog → initial/same-category status of the new flow

    // archived projects take no new cards or links
    expect((await owner.post(`${base}/cards`, { projectId: sprintA.id, typeId: task.id, title: 'late' })).status).toBe(422)
    expect((await owner.post(`${base}/cards/${open1.id}/links`, { projectId: sprintA.id })).status).toBe(422)
    expect((await owner.post(`${base}/projects/${sprintA.id}/complete`, {})).status).toBe(409)

    // finishing a carried-over card later does not change the closed sprint's numbers
    await move(carried, 'done', 'doing')
    const after = (await owner.get(`${base}/projects/${sprintA.id}/stats`)).body
    expect(after).toMatchObject({ total: 3, done: 1, inProgress: 1, todo: 1, completionPct: 33 })
    expect(after.timeline.filter((x: any) => x.completedAt)).toHaveLength(1)
    // while the new sprint sees it
    const live = (await owner.get(`${base}/projects/${next.id}/stats`)).body
    expect(live).toMatchObject({ total: 2, done: 1 })

    const reopened = await owner.post(`${base}/projects/${sprintA.id}/reopen`)
    expect(reopened.body).toMatchObject({ state: 'active', completedAt: null })
    expect((await owner.post(`${base}/projects/${sprintA.id}/reopen`)).status).toBe(409)
  })

  it('refuses a carry-over target that does not map the open cards', async () => {
    const src = await project('Source', basic, [task, bug])
    const dst = await project('Target', basic, [task])
    await card(src, 'stuck bug', bug.id)
    const r = await owner.post(`${base}/projects/${src.id}/complete`, { carryOverToProjectId: dst.id })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toMatch(/Bug/)
    expect((await owner.get(`${base}/projects/${src.id}`)).body.state).toBe('active')
    expect((await owner.post(`${base}/projects/${src.id}/complete`, { carryOverToProjectId: src.id })).status).toBe(422)
  })

  it('deletes only projects without primary cards and unlinks secondary cards', async () => {
    const a = await project('Keeper')
    const b = await project('Disposable')
    const owned = await card(a, 'Owned by keeper')
    await owner.post(`${base}/cards/${owned.id}/links`, { projectId: b.id })
    const blocker = await card(b, 'Owned by disposable')
    expect((await owner.del(`${base}/projects/${b.id}`)).status).toBe(409)
    await owner.del(`${base}/cards/${blocker.id}`)
    expect((await owner.del(`${base}/projects/${b.id}`)).status).toBe(200)
    const after = await getCard(owned.id)
    expect(after.projectIds).toEqual([a.id])
    expect(Object.keys(after.ranks)).toEqual([a.id])
    expect((await owner.get(`${base}/projects/${b.id}`)).status).toBe(404)
  })

  it('saves a project as a template, optionally with its cards', async () => {
    const p = (await owner.post(`${base}/projects`, { name: 'Release train', typeFlows: mapping(dev, task), startDate: '2026-03-02', endDate: '2026-03-15' })).body.project
    await card(p, 'Cut release', task.id, { body: '- [ ] tag' })
    const plain = await owner.post(`${base}/projects/${p.id}/save-as-template`, { name: 'Train' })
    expect(plain.status).toBe(201)
    expect(plain.body).toMatchObject({ name: 'Train', namePattern: 'Release train', durationDays: 14, blueprints: [] })
    const withCards = await owner.post(`${base}/projects/${p.id}/save-as-template`, { name: 'Train+', namePattern: 'Train {n}', includeCards: true })
    expect(withCards.body.blueprints).toMatchObject([{ typeId: task.id, title: 'Cut release', body: '- [ ] tag' }])
    const reused = await owner.post(`${base}/projects`, { templateId: withCards.body.id })
    expect(reused.body.project.name).toBe('Train 1')
    expect(reused.body.created).toBe(1)
  })
})

describe('statistics', () => {
  it('breaks a project down by status, type and assignee', async () => {
    const guest = await t.user('Gus Guest').registerVerified()
    const inv = await owner.post(`${base}/invitations`, { email: guest.email })
    await guest.post(`/api/invitations/${inv.body.invitation.id}/accept`)

    const p = await project('Numbers', basic, [task, bug])
    const c1 = await card(p, 'T1', task.id, { assigneeIds: [owner.id] })
    const c2 = await card(p, 'T2', task.id, { assigneeIds: [owner.id, guest.id] })
    await card(p, 'B1', bug.id)
    await move(c1, 'doing', 'todo')
    await move(c2, 'doing', 'todo')
    await move(c2, 'done', 'doing')

    const s = (await owner.get(`${base}/projects/${p.id}/stats`)).body
    expect(s).toMatchObject({ total: 3, todo: 1, inProgress: 1, done: 1, completionPct: 33 })
    expect(s.byStatus).toHaveLength(1)
    expect(s.byStatus[0].statuses.map((x: any) => [x.statusId, x.count])).toEqual([['todo', 1], ['doing', 1], ['done', 1]])
    expect(s.byType.map((x: any) => [x.name, x.total, x.done])).toEqual([['Task', 2, 1], ['Bug', 1, 0]])
    const byName = Object.fromEntries(s.byAssignee.map((x: any) => [x.name, [x.total, x.done]]))
    expect(byName).toEqual({ 'Pat Owner': [2, 1], 'Gus Guest': [1, 1], Unassigned: [1, 0] })
    expect(s.timeline).toHaveLength(3)
    expect(s.timeline.filter((x: any) => x.completedAt)).toHaveLength(1)

    const list = (await owner.get(`${base}/projects`)).body.find((x: any) => x.id === p.id)
    expect(list.counts).toEqual({ total: 3, done: 1 })
  })

  it('handles empty projects', async () => {
    const p = await project('Nothing yet')
    const s = (await owner.get(`${base}/projects/${p.id}/stats`)).body
    expect(s).toMatchObject({ total: 0, done: 0, completionPct: 0, byStatus: [], byType: [], byAssignee: [], timeline: [] })
  })
})

describe('starter kit', () => {
  it('is opt-in and gives a usable sprint template', async () => {
    const u = await t.user('Kit User').registerVerified()
    const empty = await u.post('/api/teams', { name: 'Bare' })
    expect((await u.get(`/api/teams/${empty.body.team.id}/card-types`)).body).toEqual([])

    const kit = await u.post('/api/teams', { name: 'Kitted', starterKit: true })
    const kb = `/api/teams/${kit.body.team.id}`
    const [types, flows, templates, projects] = await Promise.all(['card-types', 'flows', 'templates', 'projects'].map((x) => u.get(`${kb}/${x}`)))
    expect(types.body.map((x: any) => x.name).sort()).toEqual(['Bug', 'Story', 'Task'])
    expect(flows.body).toHaveLength(2)
    expect(templates.body[0]).toMatchObject({ name: 'Sprint', namePattern: 'Sprint {n}', durationDays: 14 })
    expect(projects.body.map((x: any) => x.name)).toEqual(['Backlog'])
    const sprint = await u.post(`${kb}/projects`, { templateId: templates.body[0].id })
    expect(sprint.body.project.name).toBe('Sprint 1')
    expect(sprint.body.created).toBe(1)
  })
})
