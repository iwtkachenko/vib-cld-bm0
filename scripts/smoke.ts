/**
 * End-to-end smoke test against a RUNNING stack (API on SMOKE_API, default http://localhost:4000).
 *   npm run dev  &&  npm run smoke
 * Optional: SMOKE_WEB=http://localhost:5173 also checks the Vite dev proxy; MAILPIT=http://localhost:8026 is the
 * mail inbox used to read verification links. Every run uses fresh unique accounts, so it is repeatable.
 */
import assert from 'node:assert/strict'

const API = (process.env.SMOKE_API ?? 'http://localhost:4000').replace(/\/$/, '')
const WEB = process.env.SMOKE_WEB?.replace(/\/$/, '')
const MAILPIT = (process.env.MAILPIT ?? `http://localhost:${process.env.MAILPIT_UI_PORT ?? 8026}`).replace(/\/$/, '')
const RUN = Date.now().toString(36)

let step = 0
async function check<T>(title: string, fn: () => Promise<T>): Promise<T> {
  step++
  try {
    const r = await fn()
    console.log(`  ✓ ${String(step).padStart(2, '0')} ${title}`)
    return r
  } catch (e) {
    console.error(`  ✗ ${String(step).padStart(2, '0')} ${title}\n`)
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}

class Client {
  cookie = ''
  id = ''
  constructor(readonly name: string, readonly email: string, readonly base = API) {}
  async call(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const set = res.headers.getSetCookie()[0]
    if (set) this.cookie = set.split(';')[0]!
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
  get = (p: string) => this.call('GET', p)
  post = (p: string, b: unknown = {}) => this.call('POST', p, b)
  patch = (p: string, b: unknown) => this.call('PATCH', p, b)
  del = (p: string) => this.call('DELETE', p)
  /** Call and require a status (default 2xx). */
  async ok(method: string, path: string, body?: unknown, status?: number) {
    const r = await this.call(method, path, body)
    const good = status ? r.status === status : r.status >= 200 && r.status < 300
    assert.ok(good, `${method} ${path} → ${r.status} ${JSON.stringify(r.body)}${status ? ` (expected ${status})` : ''}`)
    return r.body
  }
}

async function mailTo(address: string, subjectPart: string): Promise<{ text: string; subject: string }> {
  for (let i = 0; i < 40; i++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)).json()) as {
      messages?: { ID: string; Subject: string }[]
    }
    const hit = list.messages?.find((m) => m.Subject.includes(subjectPart))
    if (hit) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as { Text: string; Subject: string }
      return { text: full.Text, subject: full.Subject }
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`no mail to ${address} with subject containing "${subjectPart}" in Mailpit (${MAILPIT})`)
}

const user = (name: string) => new Client(name, `${name.toLowerCase()}.${RUN}@example.com`)
const flow = (name: string, ids: [string, string, string, string]) => ({
  name,
  statuses: [
    { id: ids[0], name: 'Backlog', category: 'todo', color: 'gray' },
    { id: ids[1], name: 'In progress', category: 'in_progress', color: 'blue' },
    { id: ids[2], name: 'Review', category: 'in_progress', color: 'violet' },
    { id: ids[3], name: 'Done', category: 'done', color: 'green' },
  ],
  initialStatusId: ids[0],
  // restricted: no jumping straight to done
  transitions: [
    { from: ids[0], to: ids[1] }, { from: ids[1], to: ids[2] }, { from: ids[2], to: ids[3] },
    { from: ids[1], to: ids[0] }, { from: ids[2], to: ids[1] }, { from: ids[3], to: ids[2] },
  ],
})

console.log(`Smoke test → API ${API}${WEB ? `, web ${WEB}` : ''}, mail ${MAILPIT}, run ${RUN}\n`)

await check('API health (mongo + redis)', async () => {
  const r = await (await fetch(`${API}/api/health`)).json()
  assert.deepEqual(r, { status: 'ok', mongo: true, redis: true })
})
if (WEB) {
  await check('Vite dev proxy forwards /api', async () => {
    const r = await (await fetch(`${WEB}/api/health`)).json()
    assert.equal((r as { status: string }).status, 'ok')
  })
}
await check('SPA is served (index.html)', async () => {
  const res = await fetch(`${WEB ?? API}/`)
  const text = await res.text()
  if (WEB || res.headers.get('content-type')?.includes('html')) assert.match(text, /<div id="root">/)
  else console.log('      (skipped: API does not serve the web build; run `npm run build` first)')
})

const alice = user('Alice')
const bob = user('Bob')
const carol = user('Carol')

await check('register Alice, Bob and Carol (emails normalized)', async () => {
  for (const u of [alice, bob, carol]) {
    const me = await u.ok('POST', '/api/auth/register', { email: u.email.toUpperCase(), name: u.name, password: 'smoke-pass-1' }, 201)
    assert.equal(me.user.email, u.email)
    assert.equal(me.user.emailVerified, false)
    u.id = me.user.id
  }
})

await check('Alice verifies her email via the mailed link', async () => {
  const mail = await mailTo(alice.email, 'Verify your email')
  const token = /token=([\w-]+)/.exec(mail.text)?.[1]
  assert.ok(token, 'no token in the verification mail')
  await alice.ok('POST', '/api/auth/verify-email', { token })
  assert.equal((await alice.get('/api/me')).body.user.emailVerified, true)
})

let teamId = ''
let base = ''
await check('Alice creates a team', async () => {
  const r = await alice.ok('POST', '/api/teams', { name: 'Smoke Test Co', starterKit: false }, 201)
  teamId = r.team.id
  base = `/api/teams/${teamId}`
  assert.equal(r.me.teams.length, 1)
  assert.equal(r.me.teams[0].role, 'owner')
})

let devFlow: any, basicFlow: any, task: any, bug: any, sprintTpl: any
await check('configure card types (custom fields), restricted flows and a Sprint template', async () => {
  devFlow = await alice.ok('POST', `${base}/flows`, flow('Dev', ['backlog', 'doing', 'review', 'done']), 201)
  basicFlow = await alice.ok('POST', `${base}/flows`, flow('Kanban', ['todo', 'wip', 'check', 'finished']), 201)
  task = await alice.ok('POST', `${base}/card-types`, {
    name: 'Task', icon: '✅', color: 'blue',
    fields: [{ id: 'points', name: 'Points', kind: 'number', required: true }, { id: 'area', name: 'Area', kind: 'select', options: ['api', 'web'], required: false }],
  }, 201)
  bug = await alice.ok('POST', `${base}/card-types`, { name: 'Bug', icon: '🐞', color: 'red' }, 201)
  sprintTpl = await alice.ok('POST', `${base}/templates`, {
    name: 'Sprint', namePattern: 'Sprint {n}', durationDays: 14,
    typeFlows: [{ cardTypeId: task.id, flowId: devFlow.id }, { cardTypeId: bug.id, flowId: devFlow.id }],
    blueprints: [{ id: 'planning', typeId: task.id, title: 'Sprint planning', body: '## Agenda\n\n- [ ] goals\n- [ ] capacity' }],
  }, 201)
})

let backlog: any, backlogCards: any[]
await check('create a Backlog project with cards (custom fields validated)', async () => {
  backlog = (await alice.ok('POST', `${base}/projects`, { name: 'Backlog', typeFlows: [{ cardTypeId: task.id, flowId: basicFlow.id }, { cardTypeId: bug.id, flowId: basicFlow.id }] }, 201)).project
  const missing = await alice.call('POST', `${base}/cards`, { projectId: backlog.id, typeId: task.id, title: 'x' })
  assert.equal(missing.status, 422, 'required custom field must be enforced')
  backlogCards = []
  for (const [title, typeId, fields] of [['Login page', task.id, { points: 3, area: 'web' }], ['Rate limiting', task.id, { points: 5, area: 'api' }], ['Crash on save', bug.id, {}]] as const) {
    backlogCards.push(await alice.ok('POST', `${base}/cards`, { projectId: backlog.id, typeId, title, body: `# ${title}\n\nDescribed in **markdown**.`, fields }, 201))
  }
  assert.deepEqual(backlogCards.map((c) => c.number), [1, 2, 3])
  assert.match(backlogCards[0].key, /-1$/)
})

let sprint: any
await check('new Sprint from the template: blueprint + new card + moved + linked cards, right away', async () => {
  const r = await alice.ok('POST', `${base}/projects`, {
    templateId: sprintTpl.id,
    newCards: [{ typeId: task.id, title: 'Wire up CI' }],
    cards: [{ cardId: backlogCards[0].id, mode: 'move' }, { cardId: backlogCards[2].id, mode: 'link' }],
  }, 201)
  sprint = r.project
  assert.equal(sprint.name, 'Sprint 1')
  assert.ok(sprint.startDate && sprint.endDate)
  assert.deepEqual([r.created, r.moved, r.linked], [2, 1, 1])
  const cards = await alice.ok('GET', `${base}/cards?projectId=${sprint.id}`)
  assert.equal(cards.length, 4)
  const moved = await alice.ok('GET', `${base}/cards/${backlogCards[0].id}`)
  assert.equal(moved.primaryProjectId, sprint.id, 'moved card is primary in the sprint')
  assert.equal(moved.flowId, devFlow.id, 'moved card follows the sprint flow')
  assert.deepEqual(moved.projectIds, [sprint.id])
  const linked = await alice.ok('GET', `${base}/cards/${backlogCards[2].id}`)
  assert.equal(linked.primaryProjectId, backlog.id, 'linked card keeps its primary project')
  assert.deepEqual([...linked.projectIds].sort(), [backlog.id, sprint.id].sort())
  const blueprint = cards.find((c: any) => c.title === 'Sprint planning')
  assert.equal((await alice.ok('GET', `${base}/cards/${blueprint.id}`)).body, '## Agenda\n\n- [ ] goals\n- [ ] capacity')
})

await check('assign a card to a member; non-members cannot be assigned', async () => {
  const done = await alice.ok('PATCH', `${base}/cards/${backlogCards[0].id}`, { assigneeIds: [alice.id] })
  assert.deepEqual(done.assigneeIds, [alice.id])
  const bad = await alice.call('PATCH', `${base}/cards/${backlogCards[0].id}`, { assigneeIds: [bob.id] })
  assert.equal(bad.status, 422)
})

await check('move a card through its status flow (allowed, forbidden, stale)', async () => {
  const id = backlogCards[0].id
  const t = (expected: string, to: string) => alice.call('POST', `${base}/cards/${id}/transition`, { expectedStatusId: expected, toStatusId: to })
  assert.equal((await t('backlog', 'done')).status, 422, 'backlog → done is not allowed')
  assert.equal((await t('backlog', 'doing')).body.statusCategory, 'in_progress')
  assert.equal((await t('backlog', 'doing')).status, 409, 'stale expectedStatusId')
  assert.equal((await t('doing', 'review')).status, 200)
  const done = await t('review', 'done')
  assert.equal(done.body.statusCategory, 'done')
  assert.ok(done.body.completedAt)
  assert.equal((await t('done', 'review')).body.completedAt, null)
  assert.equal((await t('review', 'done')).status, 200)
})

await check('edit a card body and custom fields', async () => {
  const c = await alice.ok('PATCH', `${base}/cards/${backlogCards[1].id}`, { body: '- [x] done item\n- [ ] open item', fields: { points: 8 } })
  assert.equal(c.body, '- [x] done item\n- [ ] open item')
  assert.equal(c.fields.points, 8)
})

await check('link a card to a second project and make it primary there (flow follows the primary)', async () => {
  const id = backlogCards[1].id
  const linked = await alice.ok('POST', `${base}/cards/${id}/links`, { projectId: sprint.id })
  assert.equal(linked.primaryProjectId, backlog.id)
  assert.equal((await alice.call('DELETE', `${base}/cards/${id}/links/${backlog.id}`)).status, 422, 'primary cannot be unlinked')
  const promoted = await alice.ok('POST', `${base}/cards/${id}/primary`, { projectId: sprint.id })
  assert.equal(promoted.primaryProjectId, sprint.id)
  assert.equal(promoted.flowId, devFlow.id)
  assert.equal(promoted.statusId, 'backlog')
})

await check('project statistics', async () => {
  const s = await alice.ok('GET', `${base}/projects/${sprint.id}/stats`)
  assert.equal(s.total, 5)
  assert.equal(s.done, 1)
  assert.equal(s.todo + s.inProgress + s.done, s.total)
  assert.ok(s.byType.length >= 2 && s.byAssignee.length >= 1 && s.timeline.length === 5)
  const list = await alice.ok('GET', `${base}/projects`)
  const row = list.find((p: any) => p.id === sprint.id)
  assert.deepEqual(row.counts, { total: 5, done: 1 })
})

await check('Alice invites Bob (mixed-case email); an email is delivered', async () => {
  const r = await alice.ok('POST', `${base}/invitations`, { email: ` ${bob.email.replace('bob', 'BOB')} ` }, 201)
  assert.equal(r.emailSent, true)
  assert.equal(r.invitation.email, bob.email)
  const mail = await mailTo(bob.email, 'invited you')
  assert.match(mail.subject, /Smoke Test Co/)
  await alice.ok('POST', `${base}/invitations`, { email: bob.email }, 409)
})

await check('Carol verifies and invites Bob to her own team too', async () => {
  const mail = await mailTo(carol.email, 'Verify your email')
  await carol.ok('POST', '/api/auth/verify-email', { token: /token=([\w-]+)/.exec(mail.text)![1] })
  const team = await carol.ok('POST', '/api/teams', { name: "Carol's Studio" }, 201)
  await carol.ok('POST', `/api/teams/${team.team.id}/invitations`, { email: bob.email }, 201)
})

await check('Bob cannot see invitations until his email is verified', async () => {
  const r = await bob.call('GET', '/api/invitations')
  assert.equal(r.status, 403)
  assert.equal(r.body.error.code, 'email_not_verified')
  const mail = await mailTo(bob.email, 'Verify your email')
  await bob.ok('POST', '/api/auth/verify-email', { token: /token=([\w-]+)/.exec(mail.text)![1] })
})

await check('Bob reviews both invitations: rejects Carol’s, accepts Alice’s', async () => {
  const invs = await bob.ok('GET', '/api/invitations')
  assert.equal(invs.length, 2)
  assert.equal((await bob.ok('GET', '/api/me')).pendingInvitations, 2)
  const carols = invs.find((i: any) => i.team.name === "Carol's Studio")
  const alices = invs.find((i: any) => i.team.id === teamId)
  assert.ok(carols && alices && alices.invitedBy.name === 'Alice')
  const rej = await bob.ok('POST', `/api/invitations/${carols.id}/reject`)
  assert.equal(rej.me.teams.length, 0)
  const acc = await bob.ok('POST', `/api/invitations/${alices.id}/accept`)
  assert.equal(acc.team.id, teamId)
  assert.equal(acc.me.user.lastTeamId, teamId)
  assert.equal(acc.me.pendingInvitations, 0)
})

await check('Bob switches into Alice’s team and works with her data', async () => {
  const me = await bob.ok('GET', '/api/me')
  assert.deepEqual(me.teams.map((t: any) => [t.team.name, t.role]), [['Smoke Test Co', 'member']])
  assert.equal((await bob.ok('GET', `${base}/projects/${sprint.id}`)).name, 'Sprint 1')
  assert.equal((await bob.ok('GET', `${base}/members`)).length, 2)
  const own = await bob.ok('POST', `${base}/cards`, { projectId: sprint.id, typeId: bug.id, title: 'Reported by Bob' }, 201)
  await bob.ok('PATCH', `${base}/cards/${own.id}`, { assigneeIds: [bob.id] })
  await bob.ok('PATCH', '/api/me', { lastTeamId: teamId })
})

await check('tenant isolation: Carol is locked out of Alice’s team and its ids', async () => {
  assert.equal((await carol.call('GET', `${base}/projects`)).status, 404)
  assert.equal((await carol.call('GET', `${base}/cards/${backlogCards[0].id}`)).status, 404)
  assert.equal((await carol.call('POST', `${base}/cards`, { projectId: sprint.id, typeId: task.id, title: 'x' })).status, 404)
  const mine = await carol.ok('GET', '/api/me')
  const carolTeam = mine.teams[0].team.id
  const cb = `/api/teams/${carolTeam}`
  const stolen = await carol.call('POST', `${cb}/projects`, { name: 'Smuggle', typeFlows: [{ cardTypeId: task.id, flowId: devFlow.id }], cards: [{ cardId: backlogCards[0].id, mode: 'move' }] })
  assert.equal(stolen.status, 422)
  assert.equal((await alice.ok('GET', `${base}/cards/${backlogCards[0].id}`)).primaryProjectId, sprint.id)
  assert.equal((await carol.call('PATCH', '/api/me', { lastTeamId: teamId })).status, 422)
  assert.equal((await new Client('anon', 'anon@example.com').call('GET', `${base}/cards`)).status, 401)
})

await check('complete the sprint: unfinished cards carry over to the Backlog', async () => {
  const r = await alice.ok('POST', `${base}/projects/${sprint.id}/complete`, { carryOverToProjectId: backlog.id })
  assert.equal(r.project.state, 'archived')
  assert.ok(r.carriedOver >= 1)
  const board = await alice.ok('GET', `${base}/cards?projectId=${backlog.id}`)
  assert.ok(board.some((c: any) => c.primaryProjectId === backlog.id && c.statusCategory !== 'done'))
  assert.equal((await alice.ok('GET', `${base}/projects/${sprint.id}/stats`)).asOf, r.project.completedAt)
})

await check('sign out ends the session', async () => {
  await alice.ok('POST', '/api/auth/logout')
  assert.equal((await alice.call('GET', '/api/me')).status, 401)
  await alice.ok('POST', '/api/auth/login', { email: alice.email, password: 'smoke-pass-1' })
  assert.equal((await alice.ok('GET', '/api/me')).teams.length, 1)
})

console.log(`\nSmoke test passed (${step} checks).`)
