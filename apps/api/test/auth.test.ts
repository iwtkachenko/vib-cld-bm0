import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from './helpers'

let t: TestApp
beforeAll(async () => { t = await createTestApp() })
afterAll(async () => { await t.close() })

describe('health', () => {
  it('pings mongo and redis', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/api/health' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ status: 'ok', mongo: true, redis: true })
  })
})

describe('auth', () => {
  it('registers (normalizing the email), logs in and out', async () => {
    const u = t.user('Ann Lee', 'Ann.Lee@Example.com')
    const reg = await u.post('/api/auth/register', { email: '  Ann.Lee@Example.com ', name: ' Ann Lee ', password: 'password123' })
    expect(reg.status).toBe(201)
    expect(reg.body.user).toMatchObject({ email: 'ann.lee@example.com', name: 'Ann Lee', emailVerified: false, lastTeamId: null })
    expect(reg.body.teams).toEqual([])
    expect(u.cookie).toMatch(/^pm_sid=/)

    expect((await u.get('/api/me')).body.user.email).toBe('ann.lee@example.com')
    expect((await u.post('/api/auth/logout')).status).toBe(200)
    expect((await u.get('/api/me')).status).toBe(401)

    expect((await u.post('/api/auth/login', { email: 'ANN.LEE@example.com', password: 'password123' })).status).toBe(200)
    expect((await u.get('/api/me')).status).toBe(200)
  })

  it('rejects duplicates, bad input and wrong credentials', async () => {
    const u = t.user('Bob')
    await u.register()
    const dup = await t.user('Bob2', u.email).post('/api/auth/register', { email: u.email, name: 'x', password: 'password123' })
    expect(dup.status).toBe(409)
    const weak = await t.user('C').post('/api/auth/register', { email: 'c@example.com', name: 'C', password: 'short' })
    expect(weak.status).toBe(400)
    expect(weak.body.error.code).toBe('validation')
    const bad = await t.user('D').post('/api/auth/login', { email: u.email, password: 'wrong-password' })
    expect(bad.status).toBe(401)
    const unknown = await t.user('E').post('/api/auth/login', { email: 'nobody@example.com', password: 'whatever12' })
    expect(unknown.status).toBe(401)
    expect(unknown.body.error.message).toBe(bad.body.error.message)
  })

  it('requires a session for user routes', async () => {
    const anon = t.user('Anon')
    for (const url of ['/api/me', '/api/invitations']) expect((await anon.get(url)).status).toBe(401)
    expect((await anon.post('/api/teams', { name: 'x' })).status).toBe(401)
  })

  it('verifies the email with the mailed single-use token', async () => {
    const u = await t.user('Dora').register()
    expect((await u.get('/api/me')).body.user.emailVerified).toBe(false)
    expect((await u.get('/api/invitations')).body.error.code).toBe('email_not_verified')
    await u.verify()
    expect((await u.get('/api/me')).body.user.emailVerified).toBe(true)
    expect((await u.get('/api/invitations')).status).toBe(200)
    const mail = [...t.mail].reverse().find((m) => m.to === u.email)!
    const token = /token=([\w-]+)/.exec(mail.text)![1]
    expect((await u.post('/api/auth/verify-email', { token })).status).toBe(400)
    expect((await u.post('/api/auth/verify-email', { token: 'definitely-not-a-token' })).status).toBe(400)
  })

  it('can resend the verification mail', async () => {
    const u = await t.user('Eve').register()
    const before = t.mail.filter((m) => m.to === u.email).length
    expect((await u.post('/api/auth/resend-verification')).status).toBe(200)
    expect(t.mail.filter((m) => m.to === u.email).length).toBe(before + 1)
  })

  it('only sets a Secure cookie for https app urls', async () => {
    const u = t.user('Fay')
    const r = await t.app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: u.email, name: 'Fay', password: 'password123' } })
    expect(String(r.headers['set-cookie'])).not.toMatch(/Secure/i)
    expect(String(r.headers['set-cookie'])).toMatch(/HttpOnly/i)
  })
})

describe('rate limiting', () => {
  it('limits login attempts per ip (redis-backed)', async () => {
    const limited = await createTestApp({ authRateLimit: 3 })
    try {
      const u = limited.user('Gus')
      const statuses: number[] = []
      for (let i = 0; i < 5; i++) statuses.push((await u.post('/api/auth/login', { email: u.email, password: 'password123' })).status)
      expect(statuses.slice(0, 3)).toEqual([401, 401, 401])
      expect(statuses.slice(3)).toEqual([429, 429])
    } finally {
      await limited.close()
    }
  })
})
