import { z } from 'zod'

/** Mongo ObjectId rendered as a 24-char hex string. */
export const idSchema = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id')
/** Client-generated stable ids (statuses, fields, blueprints). */
export const shortIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Invalid id')
export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

export function newShortId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '').slice(0, 12)
  return Math.random().toString(36).slice(2, 14).padEnd(12, '0')
}
