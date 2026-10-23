import { Redis } from 'ioredis'
import type { Config } from './config'

export function createRedis(config: Config): Redis {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: 2, enableReadyCheck: true })
}
