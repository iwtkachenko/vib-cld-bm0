import { createHash, randomBytes } from 'node:crypto'
import type { ObjectId } from 'mongodb'
import type { Deps } from '../deps'
import type { UserDoc } from '../models'
import { ObjectId as Oid } from 'mongodb'

const TTL_SECONDS = 48 * 3600
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const key = (d: Deps, token: string) => `${d.config.redisPrefix}verify:${sha(token)}`

export async function sendVerificationEmail(d: Deps, user: UserDoc): Promise<void> {
  const token = randomBytes(24).toString('base64url')
  await d.redis.set(key(d, token), user._id.toHexString(), 'EX', TTL_SECONDS)
  const link = `${d.config.appUrl}/verify-email?token=${token}`
  await d.mailer.send({
    to: user.email,
    subject: 'Verify your email address',
    text: `Hi ${user.name},\n\nConfirm your email address to start using Projects (and to see team invitations):\n${link}\n\nThe link is valid for 48 hours.`,
    html: `<p>Hi ${escapeHtml(user.name)},</p><p>Confirm your email address to start using Projects (and to see team invitations):</p><p><a href="${link}">Verify email</a></p><p>The link is valid for 48 hours.</p>`,
  })
}

/** Consumes the token; returns the verified user id, or null for an unknown/expired token. */
export async function consumeVerificationToken(d: Deps, token: string): Promise<ObjectId | null> {
  const value = await d.redis.getdel(key(d, token))
  return value && /^[a-f0-9]{24}$/.test(value) ? new Oid(value) : null
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}
