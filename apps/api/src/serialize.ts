import type {
  CardDto, CardTypeDto, FlowDto, InvitationDto, MemberDto, ProjectDto, TeamDto, TemplateDto, UserDto,
} from '@pm/shared'
import { cardKey } from '@pm/shared'
import type {
  CardDoc, CardTypeDoc, FlowDoc, InvitationDoc, MembershipDoc, ProjectDoc, TeamDoc, TemplateDoc, UserDoc,
} from './models'

const hex = (id: { toHexString(): string }) => id.toHexString()
const iso = (d: Date) => d.toISOString()

export const userDto = (u: UserDoc): UserDto => ({
  id: hex(u._id),
  email: u.email,
  name: u.name,
  emailVerified: u.emailVerifiedAt !== null,
  lastTeamId: u.lastTeamId ? hex(u.lastTeamId) : null,
})

export const teamDto = (t: TeamDoc): TeamDto => ({ id: hex(t._id), name: t.name, key: t.key, createdAt: iso(t.createdAt) })

export const memberDto = (m: MembershipDoc, u: UserDoc): MemberDto => ({
  userId: hex(u._id), name: u.name, email: u.email, role: m.role, joinedAt: iso(m.createdAt),
})

export const invitationDto = (
  i: InvitationDoc,
  extra: { team?: TeamDoc; inviter?: UserDoc } = {},
): InvitationDto => ({
  id: hex(i._id),
  teamId: hex(i.teamId),
  email: i.email,
  status: i.status,
  createdAt: iso(i.createdAt),
  ...(extra.team ? { team: { id: hex(extra.team._id), name: extra.team.name, key: extra.team.key } } : {}),
  ...(extra.inviter ? { invitedBy: { id: hex(extra.inviter._id), name: extra.inviter.name } } : {}),
})

export const cardTypeDto = (t: CardTypeDoc): CardTypeDto => ({
  id: hex(t._id), name: t.name, icon: t.icon, color: t.color, description: t.description, fields: t.fields,
  archived: t.archivedAt !== null,
})

export const flowDto = (f: FlowDoc): FlowDto => ({
  id: hex(f._id), name: f.name, description: f.description, statuses: f.statuses,
  initialStatusId: f.initialStatusId, transitions: f.transitions,
})

export const projectDto = (p: ProjectDoc, counts?: { total: number; done: number }): ProjectDto => ({
  id: hex(p._id),
  name: p.name,
  description: p.description,
  state: p.state,
  startDate: p.startDate,
  endDate: p.endDate,
  typeFlows: p.typeFlows.map((tf) => ({ cardTypeId: hex(tf.cardTypeId), flowId: hex(tf.flowId) })),
  templateId: p.templateId ? hex(p.templateId) : null,
  createdAt: iso(p.createdAt),
  completedAt: p.completedAt ? iso(p.completedAt) : null,
  ...(counts ? { counts } : {}),
})

export const templateDto = (t: TemplateDoc): TemplateDto => ({
  id: hex(t._id),
  name: t.name,
  description: t.description,
  namePattern: t.namePattern,
  durationDays: t.durationDays,
  typeFlows: t.typeFlows.map((tf) => ({ cardTypeId: hex(tf.cardTypeId), flowId: hex(tf.flowId) })),
  blueprints: t.blueprints.map((b) => ({ id: b.id, typeId: hex(b.typeId), title: b.title, body: b.body })),
  projectsCreated: t.projectsCreated,
})

export function cardDto(c: CardDoc, teamKey: string, withBody = true): CardDto {
  return {
    id: hex(c._id),
    key: cardKey(teamKey, c.number),
    number: c.number,
    typeId: hex(c.typeId),
    flowId: hex(c.flowId),
    statusId: c.statusId,
    statusCategory: c.statusCategory,
    title: c.title,
    ...(withBody ? { body: c.body } : {}),
    fields: c.fields,
    assigneeIds: c.assigneeIds.map(hex),
    primaryProjectId: hex(c.primaryProjectId),
    projectIds: c.projectIds.map(hex),
    ranks: Object.fromEntries(Object.entries(c.placements).map(([pid, p]) => [pid, p.rank])),
    createdBy: hex(c.createdBy),
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
    completedAt: c.completedAt ? iso(c.completedAt) : null,
  }
}
