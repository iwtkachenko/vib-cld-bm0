import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import {
  hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler, type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Deps } from './deps'
import { installAuth, requireUser } from './auth/hooks'
import { HttpError } from './errors'
import { authRoutes } from './routes/auth'
import { healthRoutes } from './routes/health'
import { meRoutes } from './routes/me'
import { teamRoutes } from './routes/teams'

declare module 'fastify' {
  interface FastifyInstance {
    deps: Deps
  }
}

export interface BuildOptions {
  /** Called for every registered route (used by tests to enumerate the API surface). */
  onRoute?: (route: { method: string | string[]; url: string }) => void
}

export async function buildApp(deps: Deps, options: BuildOptions = {}) {
  const { config } = deps
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    bodyLimit: 2 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.decorate('deps', deps)
  if (options.onRoute) app.addHook('onRoute', (r) => options.onRoute!({ method: r.method, url: r.url }))

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } })
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      const details = err.validation.map((v) => ({ path: v.instancePath.replace(/^\//, '').replaceAll('/', '.'), message: v.message }))
      return reply.status(400).send({
        error: { code: 'validation', message: details[0] ? `${details[0].path || 'request'}: ${details[0].message}` : 'Invalid request', details },
      })
    }
    if (err.statusCode === 429) {
      return reply.status(429).send({ error: { code: 'rate_limited', message: 'Too many attempts, try again in a minute' } })
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: 'bad_request', message: err.message } })
    }
    req.log.error({ err }, 'unhandled error')
    return reply.status(500).send({ error: { code: 'internal', message: 'Internal server error' } })
  })

  await app.register(fastifyCookie)
  await app.register(rateLimit, {
    global: false,
    redis: deps.redis,
    nameSpace: `${config.redisPrefix}rl:`,
    skipOnError: true,
  })
  installAuth(app)

  await app.register(healthRoutes, { prefix: '/api' })
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(
    async (authed) => {
      authed.addHook('preValidation', requireUser)
      await authed.register(meRoutes)
    },
    { prefix: '/api' },
  )
  await app.register(teamRoutes, { prefix: '/api/teams/:teamId' })

  if (config.webDist) {
    await app.register(fastifyStatic, { root: config.webDist })
  }
  app.setNotFoundHandler((req, reply) => {
    // SPA fallback for client-side routes only; missing assets (anything with a file extension) stay 404.
    const path = req.url.split('?')[0]!
    if (config.webDist && req.method === 'GET' && !path.startsWith('/api') && !/\.[A-Za-z0-9]+$/.test(path)) {
      return reply.sendFile('index.html')
    }
    return reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } })
  })

  return app
}
