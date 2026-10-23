/* Test harness for the cards/board/list tests: fixtures, an in-memory fake API behind `fetch`, and a render helper. Not used by the app. */
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { canTransition, type CardDto, type CardTypeDto, type FlowDto, type MeDto, type MemberDto, type ProjectDto } from '@pm/shared'

const id = (n: number) => n.toString(16).padStart(24, '0')
export const IDS = {
  team: id(1), ann: id(2), bob: id(3),
  task: id(10), bug: id(11),
  flowDev: id(20), flowBug: id(21),
  sprint: id(30), backlog: id(31), old: id(32),
  c1: id(40), c2: id(41), c3: id(42), c4: id(43),
}
const NOW = '2026-10-01T10:00:00.000Z'

export interface Db {
  me: MeDto
  members: MemberDto[]
  types: CardTypeDto[]
  flows: FlowDto[]
  projects: ProjectDto[]
  cards: CardDto[]
  bodies: Record<string, string>
  /** every non-GET request: method, path (after /api/teams/<id>), body */
  calls: { method: string; path: string; body: unknown }[]
  /** make the next transition fail with this status */
  failNextTransition?: { status: number; message: string }
  nextNumber: number
}

export function createDb(): Db {
  const team = { id: IDS.team, name: 'Acme', key: 'ACME', createdAt: NOW }
  const card = (cid: string, number: number, over: Partial<CardDto>): CardDto => ({
    id: cid, key: `ACME-${number}`, number, typeId: IDS.task, flowId: IDS.flowDev, statusId: 'todo', statusCategory: 'todo',
    title: `Card ${number}`, fields: {}, assigneeIds: [], primaryProjectId: IDS.sprint, projectIds: [IDS.sprint], ranks: { [IDS.sprint]: 'a0' },
    createdBy: IDS.ann, createdAt: NOW, updatedAt: NOW, completedAt: null, ...over,
  })
  return {
    me: { user: { id: IDS.ann, email: 'ann@example.com', name: 'Ann Lee', emailVerified: true, lastTeamId: IDS.team }, teams: [{ team, role: 'owner' }], pendingInvitations: 0 },
    members: [
      { userId: IDS.ann, name: 'Ann Lee', email: 'ann@example.com', role: 'owner', joinedAt: NOW },
      { userId: IDS.bob, name: 'Bob Stone', email: 'bob@example.com', role: 'member', joinedAt: NOW },
    ],
    types: [
      {
        id: IDS.task, name: 'Task', icon: 'T', color: 'blue', description: '', archived: false,
        fields: [
          { id: 'est', name: 'Estimate', kind: 'number', required: false },
          { id: 'prio', name: 'Priority', kind: 'select', options: ['Low', 'High'], required: true },
          { id: 'note', name: 'Note', kind: 'text', required: false },
          { id: 'due', name: 'Due', kind: 'date', required: false },
          { id: 'blocked', name: 'Blocked', kind: 'checkbox', required: false },
        ],
      },
      { id: IDS.bug, name: 'Bug', icon: 'B', color: 'red', description: '', archived: false, fields: [] },
    ],
    flows: [
      {
        id: IDS.flowDev, name: 'Dev flow', description: '', initialStatusId: 'todo',
        statuses: [
          { id: 'todo', name: 'To do', category: 'todo', color: 'gray' },
          { id: 'doing', name: 'Doing', category: 'in_progress', color: 'blue' },
          { id: 'done', name: 'Done', category: 'done', color: 'green' },
        ],
        // todo <-> doing <-> done only (no todo -> done)
        transitions: [{ from: 'todo', to: 'doing' }, { from: 'doing', to: 'todo' }, { from: 'doing', to: 'done' }, { from: 'done', to: 'doing' }],
      },
      {
        id: IDS.flowBug, name: 'Bug flow', description: '', initialStatusId: 'open',
        statuses: [
          { id: 'open', name: 'Open', category: 'todo', color: 'red' },
          { id: 'fixed', name: 'Fixed', category: 'done', color: 'green' },
        ],
        transitions: [{ from: 'open', to: 'fixed' }, { from: 'fixed', to: 'open' }],
      },
    ],
    projects: [
      {
        id: IDS.sprint, name: 'Sprint 1', description: '', state: 'active', startDate: null, endDate: null, templateId: null, createdAt: NOW, completedAt: null,
        typeFlows: [{ cardTypeId: IDS.task, flowId: IDS.flowDev }, { cardTypeId: IDS.bug, flowId: IDS.flowBug }],
      },
      {
        id: IDS.backlog, name: 'Backlog', description: '', state: 'active', startDate: null, endDate: null, templateId: null, createdAt: NOW, completedAt: null,
        typeFlows: [{ cardTypeId: IDS.task, flowId: IDS.flowDev }],
      },
      {
        id: IDS.old, name: 'Old sprint', description: '', state: 'archived', startDate: null, endDate: null, templateId: null, createdAt: NOW, completedAt: NOW,
        typeFlows: [{ cardTypeId: IDS.task, flowId: IDS.flowDev }],
      },
    ],
    cards: [
      card(IDS.c1, 1, { title: 'Write docs', ranks: { [IDS.sprint]: 'a0' }, assigneeIds: [IDS.ann] }),
      card(IDS.c2, 2, { title: 'Fix login', statusId: 'doing', statusCategory: 'in_progress', ranks: { [IDS.sprint]: 'a1' }, assigneeIds: [IDS.bob] }),
      card(IDS.c3, 3, {
        title: 'Crash on save', typeId: IDS.bug, flowId: IDS.flowBug, statusId: 'open', ranks: { [IDS.sprint]: 'a0' },
      }),
      card(IDS.c4, 4, {
        title: 'Linked from backlog', primaryProjectId: IDS.backlog, projectIds: [IDS.backlog, IDS.sprint],
        ranks: { [IDS.backlog]: 'a0', [IDS.sprint]: 'a2' },
      }),
    ],
    bodies: { [IDS.c1]: '# Docs\n\nWrite the **docs**.\n\n- [ ] intro\n- [x] api' },
    calls: [],
    nextNumber: 5,
  }
}

const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const error = (status: number, message: string, code = 'error') => json(status, { error: { code, message } })

/** Replace `fetch` with an in-memory implementation of the endpoints the cards UI uses. */
export function installFakeApi(db: Db) {
  const withBody = (c: CardDto): CardDto => ({ ...c, body: db.bodies[c.id] ?? '' })
  const summary = (c: CardDto): CardDto => {
    const { body: _body, ...rest } = c
    return rest
  }
  const find = (cardId: string) => db.cards.find((c) => c.id === cardId)

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const path = url.pathname.replace(/^\/api/, '')
    await Promise.resolve()

    if (path === '/me') return json(200, db.me)
    const m = /^\/teams\/([^/]+)(\/.*)?$/.exec(path)
    if (!m) return error(404, 'Not found')
    const rest = m[2] ?? ''
    if (method !== 'GET') db.calls.push({ method, path: rest, body })

    if (method === 'GET') {
      if (rest === '/members') return json(200, db.members)
      if (rest === '/card-types') return json(200, db.types)
      if (rest === '/flows') return json(200, db.flows)
      if (rest === '/projects') {
        const state = url.searchParams.get('state')
        return json(200, db.projects.filter((p) => !state || p.state === state))
      }
      const proj = /^\/projects\/([^/]+)$/.exec(rest)
      if (proj) {
        const p = db.projects.find((x) => x.id === proj[1])
        return p ? json(200, p) : error(404, 'Project not found')
      }
      if (rest === '/cards') {
        const pid = url.searchParams.get('projectId')
        return json(200, db.cards.filter((c) => !pid || c.projectIds.includes(pid)).map(summary))
      }
      const one = /^\/cards\/([^/]+)$/.exec(rest)
      if (one) {
        const c = find(one[1]!)
        return c ? json(200, withBody(c)) : error(404, 'Card not found')
      }
    }

    if (method === 'POST' && rest === '/cards') {
      const number = db.nextNumber++
      const created: CardDto = {
        id: id(100 + number), key: `ACME-${number}`, number, typeId: body.typeId, flowId: IDS.flowDev, statusId: 'todo', statusCategory: 'todo',
        title: body.title, fields: body.fields ?? {}, assigneeIds: body.assigneeIds ?? [], primaryProjectId: body.projectId, projectIds: [body.projectId],
        ranks: { [body.projectId]: 'a9' }, createdBy: IDS.ann, createdAt: NOW, updatedAt: NOW, completedAt: null,
      }
      db.cards.push(created)
      db.bodies[created.id] = body.body ?? ''
      return json(201, withBody(created))
    }

    const cardM = /^\/cards\/([^/]+)(\/.*)?$/.exec(rest)
    if (cardM) {
      const c = find(cardM[1]!)
      if (!c) return error(404, 'Card not found')
      const sub = cardM[2] ?? ''
      const patch = (over: Partial<CardDto>) => Object.assign(c, over, { updatedAt: new Date().toISOString() })
      if (method === 'PATCH' && sub === '') {
        if (body.title !== undefined) patch({ title: body.title })
        if (body.body !== undefined) db.bodies[c.id] = body.body
        if (body.assigneeIds !== undefined) patch({ assigneeIds: body.assigneeIds })
        if (body.fields !== undefined) {
          const fields = { ...c.fields }
          for (const [k, v] of Object.entries(body.fields as Record<string, unknown>)) {
            if (v === null) delete fields[k]
            else fields[k] = v as never
          }
          patch({ fields })
        }
        return json(200, withBody(c))
      }
      if (method === 'DELETE' && sub === '') {
        db.cards.splice(db.cards.indexOf(c), 1)
        return json(200, { ok: true })
      }
      if (method === 'POST' && sub === '/transition') {
        if (db.failNextTransition) {
          const f = db.failNextTransition
          db.failNextTransition = undefined
          return error(f.status, f.message)
        }
        if (c.statusId !== body.expectedStatusId) return error(409, 'The card was moved by someone else', 'conflict')
        const flow = db.flows.find((f) => f.id === c.flowId)!
        const to = flow.statuses.find((s) => s.id === body.toStatusId)
        if (!to) return error(422, 'Unknown status')
        if (to.id !== c.statusId && !canTransition(flow, c.statusId, to.id)) return error(422, 'Transition not allowed')
        patch({ statusId: to.id, statusCategory: to.category, ranks: body.rank ? { ...c.ranks, [body.projectId]: body.rank } : c.ranks })
        return json(200, withBody(c))
      }
      if (method === 'POST' && sub === '/primary') {
        const target = db.projects.find((p) => p.id === body.projectId)!
        const projectIds = c.projectIds.includes(target.id) ? [...c.projectIds] : [...c.projectIds, target.id]
        patch({
          primaryProjectId: target.id,
          projectIds: body.keepPreviousLink === false ? projectIds.filter((p) => p !== c.primaryProjectId) : projectIds,
          ranks: { ...c.ranks, [target.id]: c.ranks[target.id] ?? 'a5' },
        })
        return json(200, withBody(c))
      }
      if (method === 'POST' && sub === '/links') {
        patch({ projectIds: [...c.projectIds, body.projectId], ranks: { ...c.ranks, [body.projectId]: 'a5' } })
        return json(200, withBody(c))
      }
      const unlink = /^\/links\/([^/]+)$/.exec(sub)
      if (method === 'DELETE' && unlink) {
        patch({ projectIds: c.projectIds.filter((p) => p !== unlink[1]) })
        return json(200, withBody(c))
      }
    }
    return error(404, `No fake for ${method} ${path}`)
  }) as typeof fetch
}

export interface Rendered {
  router: ReturnType<typeof createMemoryRouter>
  queryClient: QueryClient
  host: HTMLElement
  unmount: () => void
}

export function renderApp(initialEntry: string, routes: RouteObject[]): Rendered {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: Infinity } },
    mutationCache: new MutationCache({ onError: () => {} }),
  })
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() =>
    root.render(
      <StrictMode>
        <MantineProvider env="test">
          <QueryClientProvider client={queryClient}>
            <ModalsProvider>
              <Notifications />
              <RouterProvider router={router} />
            </ModalsProvider>
          </QueryClientProvider>
        </MantineProvider>
      </StrictMode>,
    ),
  )
  return {
    router, queryClient, host,
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
  }
}

/** Poll (inside act) until `check` returns something truthy. */
export async function waitFor<T>(check: () => T | null | undefined | false, what = 'condition', timeout = 3000): Promise<T> {
  const start = Date.now()
  for (;;) {
    let value: T | null | undefined | false = null
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5))
      value = check()
    })
    if (value) return value
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${what}\n${document.body.innerHTML.slice(0, 3000)}`)
  }
}

export const byTestId = (testId: string, root: ParentNode = document) => root.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
export const allByTestId = (testId: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)]
export async function click(el: Element | null) {
  if (!el) throw new Error('click: element not found')
  await act(async () => {
    ;(el as HTMLElement).click()
  })
}
/** Set an input/textarea value the way React notices it. */
export async function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
