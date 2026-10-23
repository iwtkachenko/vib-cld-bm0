import type { FastifyInstance, FastifyRequest } from 'fastify'
import { SESSION_COOKIE, readSession } from './sessions'
import { unauthorized } from '../errors'
import type { UserDoc } from '../models'

declare module 'fastify' {
  interface FastifyRequest {
    user: UserDoc | null
    sessionToken: string | null
  }
}

/** Resolve the session cookie into `req.user` for every request (no enforcement). */
export function installAuth(app: FastifyInstance): void {
  app.decorateRequest('user', null)
  app.decorateRequest('sessionToken', null)
  app.addHook('onRequest', async (req) => {
    const token = req.cookies?.[SESSION_COOKIE]
    if (!token) return
    const userId = await readSession(app.deps, token)
    if (!userId) return
    const user = await app.deps.c.users.findOne({ _id: userId })
    if (user) {
      req.user = user
      req.sessionToken = token
    }
  })
}

export async function requireUser(req: FastifyRequest): Promise<void> {
  if (!req.user) throw unauthorized()
}

export function currentUser(req: FastifyRequest): UserDoc {
  if (!req.user) throw unauthorized()
  return req.user
}
