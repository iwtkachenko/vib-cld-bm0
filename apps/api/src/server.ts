import { loadConfig } from './config'
import { collections, connectMongo, ensureIndexes } from './db'
import { createSmtpMailer } from './mailer'
import { createRedis } from './redis'
import { buildApp } from './app'

const config = loadConfig()
const { client, db } = await connectMongo(config)
const c = collections(db)
await ensureIndexes(db, c)
const redis = createRedis(config)
const app = await buildApp({ config, client, db, c, redis, mailer: createSmtpMailer(config) })

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`)
  await app.close()
  await client.close()
  redis.disconnect()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

await app.listen({ port: config.port, host: config.host })
if (config.webDist) app.log.info(`Serving web app from ${config.webDist}`)
