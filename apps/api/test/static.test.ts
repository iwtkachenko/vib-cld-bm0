import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from './helpers'

let t: TestApp
let dist: string

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'pm-web-'))
  mkdirSync(join(dist, 'assets'))
  writeFileSync(join(dist, 'index.html'), '<!doctype html><div id="root"></div>')
  writeFileSync(join(dist, 'assets', 'app-1.js'), 'console.log(1)')
  t = await createTestApp({ webDist: dist })
})
afterAll(async () => {
  await t.close()
  rmSync(dist, { recursive: true, force: true })
})

const get = (url: string) => t.app.inject({ method: 'GET', url })

describe('serving the built SPA', () => {
  it('serves index.html, assets and falls back to index.html for client routes', async () => {
    const index = await get('/')
    expect(index.statusCode).toBe(200)
    expect(index.headers['content-type']).toMatch(/text\/html/)
    const asset = await get('/assets/app-1.js')
    expect(asset.statusCode).toBe(200)
    expect(asset.headers['content-type']).toMatch(/javascript/)
    const deep = await get('/t/abc/projects/def/stats?card=1')
    expect(deep.statusCode).toBe(200)
    expect(deep.headers['content-type']).toMatch(/text\/html/)
  })

  it('picks up assets added after startup (rebuilds do not need a restart)', async () => {
    writeFileSync(join(dist, 'assets', 'app-2.js'), 'console.log(2)')
    const r = await get('/assets/app-2.js')
    expect(r.statusCode).toBe(200)
    expect(r.headers['content-type']).toMatch(/javascript/)
  })

  it('does not disguise missing assets or unknown api routes as the SPA', async () => {
    const asset = await get('/assets/missing.js')
    expect(asset.statusCode).toBe(404)
    expect(asset.headers['content-type']).toMatch(/json/)
    const api = await get('/api/nope')
    expect(api.statusCode).toBe(404)
    expect(api.json().error.code).toBe('not_found')
  })
})
