import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/health', async (_req, reply) => {
    const { db, redis } = app.deps
    const [mongo, redisOk] = await Promise.all([
      db.command({ ping: 1 }).then(() => true, () => false),
      redis.ping().then((r) => r === 'PONG', () => false),
    ])
    const ok = mongo && redisOk
    return reply.status(ok ? 200 : 503).send({ status: ok ? 'ok' : 'degraded', mongo, redis: redisOk })
  })
}
