import type { ClientSession, MongoClient } from 'mongodb'

/** Run `fn` in a transaction (auto-retried on transient errors). `fn` must be safe to re-run. */
export async function withTxn<T>(client: MongoClient, fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = client.startSession()
  try {
    let result!: T
    await session.withTransaction(
      async () => {
        result = await fn(session)
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    )
    return result
  } finally {
    await session.endSession()
  }
}
