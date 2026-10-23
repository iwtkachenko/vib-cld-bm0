import type { ObjectId } from 'mongodb'
import type {
  FieldDef, FieldValues, InvitationStatus, ProjectState, Role, StatusCategory, StatusDef, Transition,
} from '@pm/shared'

export interface UserDoc {
  _id: ObjectId
  email: string
  name: string
  passwordHash: string
  emailVerifiedAt: Date | null
  lastTeamId: ObjectId | null
  createdAt: Date
}
export interface TeamDoc {
  _id: ObjectId
  name: string
  key: string
  createdBy: ObjectId
  createdAt: Date
}
export interface MembershipDoc {
  _id: ObjectId
  teamId: ObjectId
  userId: ObjectId
  role: Role
  createdAt: Date
}
export interface InvitationDoc {
  _id: ObjectId
  teamId: ObjectId
  email: string
  invitedBy: ObjectId
  status: InvitationStatus
  createdAt: Date
  respondedAt: Date | null
}
export interface CardTypeDoc {
  _id: ObjectId
  teamId: ObjectId
  name: string
  icon: string
  color: string
  description: string
  fields: FieldDef[]
  archivedAt: Date | null
  createdAt: Date
}
export interface FlowDoc {
  _id: ObjectId
  teamId: ObjectId
  name: string
  description: string
  statuses: StatusDef[]
  initialStatusId: string
  transitions: Transition[]
  createdAt: Date
}
export interface TypeFlowDoc {
  cardTypeId: ObjectId
  flowId: ObjectId
}
export interface ProjectDoc {
  _id: ObjectId
  teamId: ObjectId
  name: string
  description: string
  state: ProjectState
  startDate: string | null
  endDate: string | null
  typeFlows: TypeFlowDoc[]
  templateId: ObjectId | null
  createdBy: ObjectId
  createdAt: Date
  completedAt: Date | null
}
export interface BlueprintDoc {
  id: string
  typeId: ObjectId
  title: string
  body: string
}
export interface TemplateDoc {
  _id: ObjectId
  teamId: ObjectId
  name: string
  description: string
  namePattern: string
  durationDays: number | null
  typeFlows: TypeFlowDoc[]
  blueprints: BlueprintDoc[]
  projectsCreated: number
  createdAt: Date
}
export interface Placement {
  rank: string
  addedAt: Date
}
export interface CardDoc {
  _id: ObjectId
  teamId: ObjectId
  number: number
  typeId: ObjectId
  flowId: ObjectId
  statusId: string
  statusCategory: StatusCategory
  title: string
  body: string
  fields: FieldValues
  assigneeIds: ObjectId[]
  primaryProjectId: ObjectId
  projectIds: ObjectId[]
  /** Keyed by project id hex string. */
  placements: Record<string, Placement>
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
  statusChangedAt: Date
  completedAt: Date | null
}
export interface CounterDoc {
  _id: string
  seq: number
}
