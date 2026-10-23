import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, seedTeam, type TestApp } from './helpers'

let t: TestApp
beforeAll(async () => { t = await createTestApp() })
afterAll(async () => { await t.close() })

describe('invitations', () => {
  it('runs the whole lifecycle, including an invitee who registers later with a different case', async () => {
    const owner = await t.user('Olga').registerVerified()
    const { teamId, base } = await seedTeam(owner)

    const bob = t.user('Bob Stone')
    const mixedCase = bob.email.replace(/^(\w)/, (c) => c.toUpperCase()).replace('@example', '@EXAMPLE')

    // Invite an email that has no account yet.
    const inv = await owner.post(`${base}/invitations`, { email: ` ${mixedCase} ` })
    expect(inv.status).toBe(201)
    expect(inv.body.invitation).toMatchObject({ email: bob.email, status: 'pending', invitedBy: { name: 'Olga' } })
    expect(inv.body.emailSent).toBe(true)
    const sent = t.mail.find((m) => m.to === bob.email && m.subject.includes('invited you'))
    expect(sent?.subject).toContain('Acme Corp')
    expect((await owner.post(`${base}/invitations`, { email: bob.email })).status).toBe(409)

    // Bob signs up; invitations stay hidden until the email is verified.
    await bob.register()
    expect((await bob.get('/api/invitations')).body.error.code).toBe('email_not_verified')
    expect((await bob.post(`/api/invitations/${inv.body.invitation.id}/accept`)).status).toBe(403)
    expect((await bob.get('/api/me')).body.pendingInvitations).toBe(0)
    await bob.verify()

    expect((await bob.get('/api/me')).body.pendingInvitations).toBe(1)
    const mine = await bob.get('/api/invitations')
    expect(mine.body).toHaveLength(1)
    expect(mine.body[0]).toMatchObject({ team: { id: teamId, name: 'Acme Corp' }, invitedBy: { name: 'Olga' } })
    // Not a member yet: the team is invisible.
    expect((await bob.get(base)).status).toBe(404)

    // Accept → membership, switch target, no longer pending.
    const accepted = await bob.post(`/api/invitations/${mine.body[0].id}/accept`)
    expect(accepted.status).toBe(200)
    expect(accepted.body.team.id).toBe(teamId)
    expect(accepted.body.me.teams.map((x: any) => x.team.id)).toContain(teamId)
    expect(accepted.body.me.user.lastTeamId).toBe(teamId)
    expect(accepted.body.me.pendingInvitations).toBe(0)
    expect((await bob.get(base)).body.role).toBe('member')
    expect((await bob.post(`/api/invitations/${mine.body[0].id}/accept`)).status).toBe(404)
    expect((await owner.get(`${base}/members`)).body).toHaveLength(2)
    // Members can't be invited again.
    expect((await owner.post(`${base}/invitations`, { email: bob.email })).status).toBe(409)
  })

  it('lets the invitee reject, and the team invite again or revoke', async () => {
    const owner = await t.user('Pia').registerVerified()
    const { base } = await seedTeam(owner)
    const cleo = await t.user('Cleo').registerVerified()

    const first = await owner.post(`${base}/invitations`, { email: cleo.email })
    const rejected = await cleo.post(`/api/invitations/${first.body.invitation.id}/reject`)
    expect(rejected.status).toBe(200)
    expect(rejected.body.me.teams).toHaveLength(0)
    expect((await cleo.get('/api/invitations')).body).toHaveLength(0)
    expect((await owner.get(`${base}/invitations`)).body).toHaveLength(0)

    const second = await owner.post(`${base}/invitations`, { email: cleo.email })
    expect(second.status).toBe(201)
    expect((await owner.get(`${base}/invitations`)).body).toHaveLength(1)
    expect((await owner.del(`${base}/invitations/${second.body.invitation.id}`)).status).toBe(200)
    expect((await owner.del(`${base}/invitations/${second.body.invitation.id}`)).status).toBe(404)
    expect((await cleo.get('/api/invitations')).body).toHaveLength(0)
    expect((await cleo.post(`/api/invitations/${second.body.invitation.id}/accept`)).status).toBe(404)
  })

  it('only the addressee can answer an invitation', async () => {
    const owner = await t.user('Quin').registerVerified()
    const { base } = await seedTeam(owner)
    const invited = await t.user('Ivy').registerVerified()
    const other = await t.user('Oscar').registerVerified()
    const inv = await owner.post(`${base}/invitations`, { email: invited.email })
    expect((await other.post(`/api/invitations/${inv.body.invitation.id}/accept`)).status).toBe(404)
    expect((await other.post(`/api/invitations/${inv.body.invitation.id}/reject`)).status).toBe(404)
    expect((await invited.post(`/api/invitations/${inv.body.invitation.id}/accept`)).status).toBe(200)
  })

  it('reports a delivery failure but keeps the invitation', async () => {
    const owner = await t.user('Rae').registerVerified()
    const { base } = await seedTeam(owner)
    const original = t.deps.mailer.send
    t.deps.mailer.send = async () => { throw new Error('smtp down') }
    try {
      const inv = await owner.post(`${base}/invitations`, { email: 'someone.else@example.com' })
      expect(inv.status).toBe(201)
      expect(inv.body.emailSent).toBe(false)
      expect((await owner.get(`${base}/invitations`)).body).toHaveLength(1)
    } finally {
      t.deps.mailer.send = original
    }
  })

  it('validates the invited email', async () => {
    const owner = await t.user('Sam').registerVerified()
    const { base } = await seedTeam(owner)
    expect((await owner.post(`${base}/invitations`, { email: 'not-an-email' })).status).toBe(400)
  })
})

describe('team switching and members', () => {
  it('lists every team of a user and remembers the last used one', async () => {
    const u = await t.user('Tess').registerVerified()
    const a = await u.post('/api/teams', { name: 'Alpha Team' })
    const b = await u.post('/api/teams', { name: 'Beta Team' })
    expect(b.body.me.teams.map((x: any) => x.team.name)).toEqual(['Alpha Team', 'Beta Team'])
    expect(b.body.me.user.lastTeamId).toBe(b.body.team.id)
    const switched = await u.patch('/api/me', { lastTeamId: a.body.team.id })
    expect(switched.body.user.lastTeamId).toBe(a.body.team.id)
    const stranger = await t.user('Uma').registerVerified()
    const foreign = await stranger.post('/api/teams', { name: 'Foreign' })
    expect((await u.patch('/api/me', { lastTeamId: foreign.body.team.id })).status).toBe(422)
  })

  it('derives a card key from the team name and accepts a custom one', async () => {
    const u = await t.user('Vic').registerVerified()
    expect((await u.post('/api/teams', { name: 'Acme Corp' })).body.team.key).toBe('AC')
    expect((await u.post('/api/teams', { name: 'Platform' })).body.team.key).toBe('PLAT')
    expect((await u.post('/api/teams', { name: 'Custom', key: 'cx1' })).body.team.key).toBe('CX1')
    expect((await u.post('/api/teams', { name: 'Bad', key: '1x' })).status).toBe(400)
  })

  it('protects the last owner and the role/remove permissions', async () => {
    const owner = await t.user('Wes').registerVerified()
    const { base } = await seedTeam(owner)
    const member = await t.user('Xena').registerVerified()
    const inv = await owner.post(`${base}/invitations`, { email: member.email })
    await member.post(`/api/invitations/${inv.body.invitation.id}/accept`)

    // Plain members can't manage the team.
    expect((await member.patch(`${base}/members/${owner.id}`, { role: 'member' })).status).toBe(403)
    expect((await member.del(`${base}/members/${owner.id}`)).status).toBe(403)
    expect((await member.patch(base, { name: 'Hijacked' })).status).toBe(403)

    // The only owner can neither leave nor demote themselves.
    expect((await owner.del(`${base}/members/${owner.id}`)).status).toBe(409)
    expect((await owner.patch(`${base}/members/${owner.id}`, { role: 'member' })).status).toBe(409)

    // After promoting a second owner both rules relax.
    expect((await owner.patch(`${base}/members/${member.id}`, { role: 'owner' })).status).toBe(200)
    expect((await member.patch(base, { name: 'Renamed', key: 'rn' })).body.team).toMatchObject({ name: 'Renamed', key: 'RN' })
    expect((await owner.del(`${base}/members/${owner.id}`)).status).toBe(200)
    expect((await owner.get(base)).status).toBe(404)
    expect((await member.patch(`${base}/members/${member.id}`, { role: 'member' })).status).toBe(409)
  })

  it('unassigns a removed member from cards', async () => {
    const owner = await t.user('Yan').registerVerified()
    const { base, type, project } = await seedTeam(owner)
    const member = await t.user('Zed').registerVerified()
    const inv = await owner.post(`${base}/invitations`, { email: member.email })
    await member.post(`/api/invitations/${inv.body.invitation.id}/accept`)
    const card = await owner.post(`${base}/cards`, {
      projectId: project.id, typeId: type.id, title: 'Assigned', fields: { pts: 1 }, assigneeIds: [member.id, owner.id],
    })
    expect(card.body.assigneeIds).toHaveLength(2)
    expect((await owner.del(`${base}/members/${member.id}`)).status).toBe(200)
    expect((await owner.get(`${base}/cards/${card.body.id}`)).body.assigneeIds).toEqual([owner.id])
    expect((await member.get(`${base}/cards/${card.body.id}`)).status).toBe(404)
  })
})
