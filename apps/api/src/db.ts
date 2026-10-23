import { MongoClient, type Collection, type Db } from 'mongodb'
import type { Config } from './config'
import type {
  CardDoc, CardTypeDoc, CounterDoc, FlowDoc, InvitationDoc, MembershipDoc, ProjectDoc, TeamDoc, TemplateDoc, UserDoc,
} from './models'

export interface Collections {
  users: Collection<UserDoc>
  teams: Collection<TeamDoc>
  memberships: Collection<MembershipDoc>
  invitations: Collection<InvitationDoc>
  cardTypes: Collection<CardTypeDoc>
  flows: Collection<FlowDoc>
  projects: Collection<ProjectDoc>
  templates: Collection<TemplateDoc>
  cards: Collection<CardDoc>
  counters: Collection<CounterDoc>
}

export function collections(db: Db): Collections {
  return {
    users: db.collection<UserDoc>('users'),
    teams: db.collection<TeamDoc>('teams'),
    memberships: db.collection<MembershipDoc>('memberships'),
    invitations: db.collection<InvitationDoc>('invitations'),
    cardTypes: db.collection<CardTypeDoc>('cardTypes'),
    flows: db.collection<FlowDoc>('flows'),
    projects: db.collection<ProjectDoc>('projects'),
    templates: db.collection<TemplateDoc>('templates'),
    cards: db.collection<CardDoc>('cards'),
    counters: db.collection<CounterDoc>('counters'),
  }
}

export async function connectMongo(config: Config) {
  const client = new MongoClient(config.mongoUrl, { serverSelectionTimeoutMS: 5000 })
  await client.connect()
  const db = client.db(config.dbName)
  return { client, db, c: collections(db) }
}

/** Create collections (needed for transactions) and indexes. Idempotent. */
export async function ensureIndexes(db: Db, c: Collections): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((x) => x.name))
  for (const name of ['users', 'teams', 'memberships', 'invitations', 'cardTypes', 'flows', 'projects', 'templates', 'cards', 'counters']) {
    if (!existing.has(name)) await db.createCollection(name).catch(() => undefined)
  }
  await Promise.all([
    c.users.createIndex({ email: 1 }, { unique: true }),
    c.memberships.createIndex({ teamId: 1, userId: 1 }, { unique: true }),
    c.memberships.createIndex({ userId: 1 }),
    c.invitations.createIndex({ teamId: 1, email: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } }),
    c.invitations.createIndex({ email: 1, status: 1 }),
    c.cardTypes.createIndex({ teamId: 1 }),
    c.flows.createIndex({ teamId: 1 }),
    c.projects.createIndex({ teamId: 1, state: 1 }),
    c.templates.createIndex({ teamId: 1 }),
    c.cards.createIndex({ teamId: 1, number: 1 }, { unique: true }),
    c.cards.createIndex({ teamId: 1, projectIds: 1 }),
    c.cards.createIndex({ teamId: 1, primaryProjectId: 1 }),
    c.cards.createIndex({ teamId: 1, flowId: 1, statusId: 1 }),
    c.cards.createIndex({ teamId: 1, assigneeIds: 1 }),
    c.cards.createIndex({ teamId: 1, typeId: 1 }),
  ])
}
