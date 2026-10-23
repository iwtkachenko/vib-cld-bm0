import { randomUUID } from 'node:crypto'
import type { Config } from '../src/config'
import { loadConfig } from '../src/config'
import { buildApp } from '../src/app'
import { collections, connectMongo, ensureIndexes } from '../src/db'
import type { Deps } from '../src/deps'
import type { Mail, Mailer } from '../src/mailer'
import { createRedis } from '../src/redis'

export interface TestApp {
  app: Awaited<ReturnType<typeof buildApp>>
  deps: Deps
  mail: Mail[]
  routes: { method: string; url: string }[]
  close: () => Promise<void>
  user: (name: string, email?: string) => TestUser
}

export async function createTestApp(overrides: Partial<Config> = {}): Promise<TestApp> {
  const id = randomUUID().slice(0, 8)
  const config = loadConfig({
    dbName: `pm_test_${id}`, redisPrefix: `pmtest:${id}:`, logLevel: 'silent', authRateLimit: 100_000,
    env: 'test', webDist: null, appUrl: 'http://localhost:5173', ...overrides,
  })
  const { client, db } = await connectMongo(config)
  const c = collections(db)
  await ensureIndexes(db, c)
  const redis = createRedis(config)
  const mail: Mail[] = []
  const mailer: Mailer = { send: async (m) => void mail.push(m) }
  const deps: Deps = { config, client, db, c, redis, mailer }
  const routes: { method: string; url: string }[] = []
  const app = await buildApp(deps, {
    onRoute: (r) => {
      for (const method of Array.isArray(r.method) ? r.method : [r.method]) routes.push({ method, url: r.url })
    },
  })
  await app.ready()
  const t: TestApp = {
    app, deps, mail, routes,
    close: async () => {
      await app.close()
      await db.dropDatabase()
      await client.close()
      const keys = await redis.keys(`${config.redisPrefix}*`)
      if (keys.length) await redis.del(...keys)
      redis.disconnect()
    },
    user: (name, email) => new TestUser(t, name, email ?? `${name.toLowerCase().replace(/\W+/g, '.')}.${id}@example.com`),
  }
  return t
}

export interface Res<T = any> {
  status: number
  body: T
}

/** A tiny HTTP client with its own cookie jar, talking to the app through `inject`. */
export class TestUser {
  cookie = ''
  id = ''
  constructor(readonly t: TestApp, readonly name: string, readonly email: string) {}

  async call<T = any>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<Res<T>> {
    const res = await this.t.app.inject({
      method, url, headers: { ...(this.cookie ? { cookie: this.cookie } : {}) }, ...(body !== undefined ? { payload: body as object } : {}),
    })
    const set = res.headers['set-cookie']
    const first = Array.isArray(set) ? set[0] : set
    if (first) {
      const pair = first.split(';')[0]!
      this.cookie = pair.endsWith('=') ? '' : pair
    }
    return { status: res.statusCode, body: res.body ? safeParse(res.body) : null }
  }
  get = <T = any>(url: string) => this.call<T>('GET', url)
  post = <T = any>(url: string, body: unknown = {}) => this.call<T>('POST', url, body)
  patch = <T = any>(url: string, body: unknown) => this.call<T>('PATCH', url, body)
  del = <T = any>(url: string) => this.call<T>('DELETE', url)

  async register(password = 'password123'): Promise<this> {
    const r = await this.post('/api/auth/register', { email: this.email, name: this.name, password })
    if (r.status !== 201) throw new Error(`register failed: ${JSON.stringify(r.body)}`)
    this.id = r.body.user.id
    return this
  }
  /** Follow the verification link from the captured mail. */
  async verify(): Promise<this> {
    const mail = [...this.t.mail].reverse().find((m) => m.to === this.email && m.text.includes('/verify-email?token='))
    if (!mail) throw new Error('no verification mail')
    const token = /token=([\w-]+)/.exec(mail.text)![1]
    const r = await this.post('/api/auth/verify-email', { token })
    if (r.status !== 200) throw new Error(`verify failed: ${JSON.stringify(r.body)}`)
    return this
  }
  async registerVerified(): Promise<this> {
    await this.register()
    return this.verify()
  }
}

function safeParse(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Team + a minimal configuration (one card type with fields, a flow, a project) created through the API. */
export async function seedTeam(owner: TestUser, opts: { starterKit?: boolean } = {}) {
  const created = await owner.post('/api/teams', { name: 'Acme Corp', starterKit: opts.starterKit ?? false })
  if (created.status !== 201) throw new Error(`team failed: ${JSON.stringify(created.body)}`)
  const teamId: string = created.body.team.id
  const base = `/api/teams/${teamId}`
  const flow = await owner.post(`${base}/flows`, basicFlow('Basic'))
  const type = await owner.post(`${base}/card-types`, {
    name: 'Task', icon: '✅', color: 'blue', description: '',
    fields: [
      { id: 'pts', name: 'Points', kind: 'number', required: true },
      { id: 'sev', name: 'Severity', kind: 'select', options: ['low', 'high'], required: false },
    ],
  })
  const project = await owner.post(`${base}/projects`, { name: 'Alpha', typeFlows: [{ cardTypeId: type.body.id, flowId: flow.body.id }] })
  return { teamId, base, flow: flow.body, type: type.body, project: project.body.project, key: created.body.team.key as string }
}

export const basicFlow = (name: string) => ({
  name,
  statuses: [
    { id: 'todo', name: 'To Do', category: 'todo', color: 'gray' },
    { id: 'doing', name: 'Doing', category: 'in_progress', color: 'blue' },
    { id: 'done', name: 'Done', category: 'done', color: 'green' },
  ],
  initialStatusId: 'todo',
  transitions: [
    { from: 'todo', to: 'doing' }, { from: 'doing', to: 'todo' }, { from: 'doing', to: 'done' }, { from: 'done', to: 'doing' },
  ],
})
