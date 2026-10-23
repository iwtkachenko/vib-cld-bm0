import type { MongoClient, Db } from 'mongodb'
import type { Redis } from 'ioredis'
import type { Config } from './config'
import type { Collections } from './db'
import type { Mailer } from './mailer'

export interface Deps {
  config: Config
  client: MongoClient
  db: Db
  c: Collections
  redis: Redis
  mailer: Mailer
}
