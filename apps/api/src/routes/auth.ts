import { ObjectId } from 'mongodb'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { loginInput, registerInput, verifyEmailInput } from '@pm/shared'
import { currentUser, requireUser } from '../auth/hooks'
import { dummyVerify, hashPassword, verifyPassword } from '../auth/password'
import { clearSessionCookie, createSession, destroySession, setSessionCookie } from '../auth/sessions'
import { consumeVerificationToken, sendVerificationEmail } from '../auth/verification'
import { badRequest, conflict, isDuplicateKey, unauthorized } from '../errors'
import type { UserDoc } from '../models'
import { buildMe } from '../services/me'

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const limited = { config: { rateLimit: { max: app.deps.config.authRateLimit, timeWindow: '1 minute' } } }

  app.post('/register', { ...limited, schema: { body: registerInput } }, async (req, reply) => {
    const d = app.deps
    const { email, name, password } = req.body
    const user: UserDoc = {
      _id: new ObjectId(), email, name, passwordHash: await hashPassword(password),
      emailVerifiedAt: null, lastTeamId: null, createdAt: new Date(),
    }
    try {
      await d.c.users.insertOne(user)
    } catch (e) {
      if (isDuplicateKey(e)) throw conflict('An account with this email already exists')
      throw e
    }
    sendVerificationEmail(d, user).catch((err) => req.log.error({ err }, 'verification email failed'))
    setSessionCookie(d, reply, await createSession(d, user._id))
    return reply.status(201).send(await buildMe(d, user))
  })

  app.post('/login', { ...limited, schema: { body: loginInput } }, async (req, reply) => {
    const d = app.deps
    const user = await d.c.users.findOne({ email: req.body.email })
    if (!user) {
      await dummyVerify(req.body.password)
      throw unauthorized('Wrong email or password')
    }
    if (!(await verifyPassword(req.body.password, user.passwordHash))) throw unauthorized('Wrong email or password')
    setSessionCookie(d, reply, await createSession(d, user._id))
    return reply.send(await buildMe(d, user))
  })

  app.post('/logout', async (req, reply) => {
    if (req.sessionToken) await destroySession(app.deps, req.sessionToken)
    clearSessionCookie(reply)
    return reply.send({ ok: true })
  })

  app.post('/verify-email', { ...limited, schema: { body: verifyEmailInput } }, async (req, reply) => {
    const userId = await consumeVerificationToken(app.deps, req.body.token)
    if (!userId) throw badRequest('This verification link is invalid or has expired')
    await app.deps.c.users.updateOne({ _id: userId, emailVerifiedAt: null }, { $set: { emailVerifiedAt: new Date() } })
    return reply.send({ ok: true })
  })

  app.post('/resend-verification', { ...limited, preValidation: [requireUser] }, async (req, reply) => {
    const user = currentUser(req)
    if (user.emailVerifiedAt) return reply.send({ ok: true })
    await sendVerificationEmail(app.deps, user)
    return reply.send({ ok: true })
  })
}
