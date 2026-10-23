import {
  ObjectId,
  type AggregateOptions, type Collection, type CountDocumentsOptions, type DeleteOptions, type Document,
  type Filter, type FindOneAndUpdateOptions, type FindOptions, type InsertOneOptions, type OptionalUnlessRequiredId,
  type UpdateFilter, type UpdateOptions,
} from 'mongodb'
import type { Role } from '@pm/shared'
import type { Deps } from './deps'
import type { TeamDoc, UserDoc } from './models'
import { notFound, unprocessable } from './errors'

const OID_RE = /^[a-f0-9]{24}$/

/** Parse an id from a URL path; anything malformed is simply "not found". */
export function pathOid(value: string, label = 'Resource'): ObjectId {
  if (!OID_RE.test(value)) throw notFound(`${label} not found`)
  return new ObjectId(value)
}
export const oid = (value: string): ObjectId => new ObjectId(value)
export const oids = (values: string[]): ObjectId[] => values.map((v) => new ObjectId(v))
export const uniqueOids = (values: ObjectId[]): ObjectId[] => [...new Map(values.map((v) => [v.toHexString(), v])).values()]

/**
 * A collection accessor that injects `teamId` into every filter/insert/pipeline,
 * so tenant-scoped code can't forget the tenant boundary.
 */
export function scope<T extends { teamId: ObjectId }>(col: Collection<T>, teamId: ObjectId) {
  const withTeam = (filter: Filter<T> = {}): Filter<T> => ({ ...filter, teamId }) as Filter<T>
  return {
    teamId,
    find: (filter?: Filter<T>, options?: FindOptions) => col.find(withTeam(filter), options),
    findOne: (filter: Filter<T>, options?: FindOptions) => col.findOne(withTeam(filter), options),
    count: (filter?: Filter<T>, options?: CountDocumentsOptions) => col.countDocuments(withTeam(filter), options),
    insertOne: (doc: Omit<T, 'teamId' | '_id'> & { _id?: ObjectId }, options?: InsertOneOptions) =>
      col.insertOne({ ...doc, teamId } as unknown as OptionalUnlessRequiredId<T>, options),
    insertMany: (docs: (Omit<T, 'teamId' | '_id'> & { _id?: ObjectId })[], options?: InsertOneOptions) =>
      col.insertMany(docs.map((d) => ({ ...d, teamId }) as unknown as OptionalUnlessRequiredId<T>), options),
    updateOne: (filter: Filter<T>, update: UpdateFilter<T> | Document[], options?: UpdateOptions) =>
      col.updateOne(withTeam(filter), update, options),
    updateMany: (filter: Filter<T>, update: UpdateFilter<T> | Document[], options?: UpdateOptions) =>
      col.updateMany(withTeam(filter), update, options),
    findOneAndUpdate: (filter: Filter<T>, update: UpdateFilter<T>, options: FindOneAndUpdateOptions = {}) =>
      col.findOneAndUpdate(withTeam(filter), update, options),
    deleteOne: (filter: Filter<T>, options?: DeleteOptions) => col.deleteOne(withTeam(filter), options),
    deleteMany: (filter: Filter<T>, options?: DeleteOptions) => col.deleteMany(withTeam(filter), options),
    aggregate: <R extends Document = Document>(pipeline: Document[], options?: AggregateOptions) =>
      col.aggregate<R>([{ $match: { teamId } }, ...pipeline], options),
  }
}
export type Scoped<T extends { teamId: ObjectId }> = ReturnType<typeof scope<T>>

export function teamScope(deps: Deps, team: TeamDoc, user: UserDoc, role: Role) {
  const teamId = team._id
  const { c } = deps
  return {
    deps,
    team,
    user,
    role,
    teamId,
    memberships: scope(c.memberships, teamId),
    invitations: scope(c.invitations, teamId),
    cardTypes: scope(c.cardTypes, teamId),
    flows: scope(c.flows, teamId),
    projects: scope(c.projects, teamId),
    templates: scope(c.templates, teamId),
    cards: scope(c.cards, teamId),
  }
}
export type TeamScope = ReturnType<typeof teamScope>

/** Ensure every id refers to a document of this team; otherwise 422 (never reveals other tenants' data). */
export async function assertRefs<T extends { teamId: ObjectId }>(
  col: Scoped<T>,
  ids: ObjectId[],
  label: string,
  session?: import('mongodb').ClientSession,
): Promise<void> {
  const unique = uniqueOids(ids)
  if (unique.length === 0) return
  const found = await col.count({ _id: { $in: unique } } as Filter<T>, { session })
  if (found !== unique.length) throw unprocessable(`Unknown ${label}`)
}
