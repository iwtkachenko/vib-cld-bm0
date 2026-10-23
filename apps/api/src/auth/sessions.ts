import { createHash, randomBytes } from 'node:crypto'
import type { FastifyReply } from 'fastify'
import type { Deps } from '../deps'
import { ObjectId } from 'mongodb'

export const SESSION_COOKIE = 'pm_sid'
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const sessionKey = (d: Deps, token: string) => `${d.config.redisPrefix}sess:${sha(token)}`
const ttlSeconds = (d: Deps) => d.config.sessionTtlDays * 86400

export async function createSession(d: Deps, userId: ObjectId): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await d.redis.set(sessionKey(d, token), userId.toHexString(), 'EX', ttlSeconds(d))
  return token
}

/** Returns the user id for a session token and slides its expiry. */
export async function readSession(d: Deps, token: string): Promise<ObjectId | null> {
  const value = await d.redis.getex(sessionKey(d, token), 'EX', ttlSeconds(d))
  return value && /^[a-f0-9]{24}$/.test(value) ? new ObjectId(value) : null
}

export async function destroySession(d: Deps, token: string): Promise<void> {
  await d.redis.del(sessionKey(d, token))
}

export function setSessionCookie(d: Deps, reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: d.config.appUrl.startsWith('https://'),
    path: '/',
    maxAge: ttlSeconds(d),
  })
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}
