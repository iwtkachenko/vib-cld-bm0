export type StatusCategory = 'todo' | 'in_progress' | 'done'
export const STATUS_CATEGORIES: StatusCategory[] = ['todo', 'in_progress', 'done']

export interface StatusDef {
  id: string
  name: string
  category: StatusCategory
  color: string
}
export interface Transition {
  from: string
  to: string
}
export interface FlowShape {
  statuses: StatusDef[]
  initialStatusId: string
  transitions: Transition[]
}

export type FieldKind = 'text' | 'number' | 'select' | 'date' | 'checkbox'
export const FIELD_KINDS: FieldKind[] = ['text', 'number', 'select', 'date', 'checkbox']
export interface FieldDef {
  id: string
  name: string
  kind: FieldKind
  options?: string[]
  required: boolean
}
export type FieldValue = string | number | boolean | null
export type FieldValues = Record<string, FieldValue>

export type Role = 'owner' | 'member'
export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'revoked'
export type ProjectState = 'active' | 'archived'

export interface TypeFlow {
  cardTypeId: string
  flowId: string
}
