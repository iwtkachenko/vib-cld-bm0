import type {
  FieldDef,
  FieldValues,
  InvitationStatus,
  ProjectState,
  Role,
  StatusCategory,
  StatusDef,
  Transition,
  TypeFlow,
} from './types'

export interface UserDto {
  id: string
  email: string
  name: string
  emailVerified: boolean
  lastTeamId: string | null
}
export interface TeamDto {
  id: string
  name: string
  key: string
  createdAt: string
}
export interface TeamMembershipDto {
  team: TeamDto
  role: Role
}
export interface MeDto {
  user: UserDto
  teams: TeamMembershipDto[]
  pendingInvitations: number
}
export interface MemberDto {
  userId: string
  name: string
  email: string
  role: Role
  joinedAt: string
}
export interface InvitationDto {
  id: string
  teamId: string
  email: string
  status: InvitationStatus
  createdAt: string
  /** Present on a user's own invitation list. */
  team?: { id: string; name: string; key: string }
  invitedBy?: { id: string; name: string }
}
export interface CardTypeDto {
  id: string
  name: string
  icon: string
  color: string
  description: string
  fields: FieldDef[]
  archived: boolean
}
export interface FlowDto {
  id: string
  name: string
  description: string
  statuses: StatusDef[]
  initialStatusId: string
  transitions: Transition[]
}
export interface FlowUsageDto {
  byStatus: Record<string, number>
  cardCount: number
  projectCount: number
  templateCount: number
}
export interface ProjectDto {
  id: string
  name: string
  description: string
  state: ProjectState
  startDate: string | null
  endDate: string | null
  typeFlows: TypeFlow[]
  templateId: string | null
  createdAt: string
  completedAt: string | null
  /** Cards linked to the project / how many are in a done status. */
  counts?: { total: number; done: number }
}
export interface BlueprintDto {
  id: string
  typeId: string
  title: string
  body: string
}
export interface TemplateDto {
  id: string
  name: string
  description: string
  namePattern: string
  durationDays: number | null
  typeFlows: TypeFlow[]
  blueprints: BlueprintDto[]
  projectsCreated: number
}
export interface CardDto {
  id: string
  key: string
  number: number
  typeId: string
  flowId: string
  statusId: string
  statusCategory: StatusCategory
  title: string
  /** Omitted from list responses. */
  body?: string
  fields: FieldValues
  assigneeIds: string[]
  primaryProjectId: string
  projectIds: string[]
  /** Fractional-indexing rank per linked project. */
  ranks: Record<string, string>
  createdBy: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
}
export interface ProjectStatsDto {
  asOf: string
  total: number
  todo: number
  inProgress: number
  done: number
  completionPct: number
  byStatus: {
    flowId: string
    flowName: string
    statuses: { statusId: string; name: string; category: StatusCategory; color: string; count: number }[]
  }[]
  byType: { typeId: string; name: string; color: string; total: number; done: number }[]
  byAssignee: { userId: string | null; name: string; total: number; done: number }[]
  timeline: { addedAt: string; completedAt: string | null }[]
}
