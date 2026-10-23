import type {
  CardDto, CardTypeBody, CardTypeDto, CompleteProjectBody, CreateCardBody, CreateProjectBody, CreateTeamBody, FlowBody, FlowDto,
  FlowUsageDto, InvitationDto, ListCardsParams, LoginBody, MeDto, MemberDto, ProjectDto, ProjectStatsDto, RegisterBody, Role,
  SaveAsTemplateBody, SetPrimaryBody, TeamDto, TemplateBody, TemplateDto, TransitionBody, UpdateCardBody, UpdateProjectBody,
} from '@pm/shared'
import { http, qs } from './client'

type Ok = { ok: true }

export const authApi = {
  register: (b: RegisterBody) => http.post<MeDto>('/auth/register', b),
  login: (b: LoginBody) => http.post<MeDto>('/auth/login', b),
  logout: () => http.post<Ok>('/auth/logout'),
  verifyEmail: (token: string) => http.post<Ok>('/auth/verify-email', { token }),
  resendVerification: () => http.post<Ok>('/auth/resend-verification'),
}

export const meApi = {
  get: () => http.get<MeDto>('/me'),
  update: (b: { name?: string; lastTeamId?: string }) => http.patch<MeDto>('/me', b),
  createTeam: (b: CreateTeamBody) => http.post<{ team: TeamDto; me: MeDto }>('/teams', b),
  invitations: () => http.get<InvitationDto[]>('/invitations'),
  accept: (id: string) => http.post<{ team: TeamDto | null; me: MeDto }>(`/invitations/${id}/accept`),
  reject: (id: string) => http.post<{ me: MeDto }>(`/invitations/${id}/reject`),
}

/** All team-scoped endpoints. `t` is the team id. */
export const teamApi = (t: string) => {
  const base = `/teams/${t}`
  return {
    get: () => http.get<{ team: TeamDto; role: Role }>(base),
    update: (b: { name?: string; key?: string }) => http.patch<{ team: TeamDto; role: Role }>(base, b),
    members: () => http.get<MemberDto[]>(`${base}/members`),
    setRole: (userId: string, role: Role) => http.patch<Ok>(`${base}/members/${userId}`, { role }),
    removeMember: (userId: string) => http.del<Ok>(`${base}/members/${userId}`),
    invitations: () => http.get<InvitationDto[]>(`${base}/invitations`),
    invite: (email: string) => http.post<{ invitation: InvitationDto; emailSent: boolean }>(`${base}/invitations`, { email }),
    revokeInvitation: (id: string) => http.del<Ok>(`${base}/invitations/${id}`),

    cardTypes: {
      list: () => http.get<CardTypeDto[]>(`${base}/card-types`),
      create: (b: CardTypeBody) => http.post<CardTypeDto>(`${base}/card-types`, b),
      update: (id: string, b: CardTypeBody) => http.patch<CardTypeDto>(`${base}/card-types/${id}`, b),
      archive: (id: string) => http.post<CardTypeDto>(`${base}/card-types/${id}/archive`),
      unarchive: (id: string) => http.post<CardTypeDto>(`${base}/card-types/${id}/unarchive`),
      remove: (id: string) => http.del<Ok>(`${base}/card-types/${id}`),
    },
    flows: {
      list: () => http.get<FlowDto[]>(`${base}/flows`),
      get: (id: string) => http.get<FlowDto>(`${base}/flows/${id}`),
      usage: (id: string) => http.get<FlowUsageDto>(`${base}/flows/${id}/usage`),
      create: (b: FlowBody) => http.post<FlowDto>(`${base}/flows`, b),
      update: (id: string, b: FlowBody) => http.patch<FlowDto>(`${base}/flows/${id}`, b),
      remove: (id: string) => http.del<Ok>(`${base}/flows/${id}`),
    },
    templates: {
      list: () => http.get<TemplateDto[]>(`${base}/templates`),
      create: (b: TemplateBody) => http.post<TemplateDto>(`${base}/templates`, b),
      update: (id: string, b: TemplateBody) => http.patch<TemplateDto>(`${base}/templates/${id}`, b),
      remove: (id: string) => http.del<Ok>(`${base}/templates/${id}`),
    },
    projects: {
      list: (state?: 'active' | 'archived') => http.get<ProjectDto[]>(`${base}/projects${qs({ state })}`),
      get: (id: string) => http.get<ProjectDto>(`${base}/projects/${id}`),
      create: (b: CreateProjectBody) =>
        http.post<{ project: ProjectDto; created: number; linked: number; moved: number }>(`${base}/projects`, b),
      update: (id: string, b: UpdateProjectBody) => http.patch<ProjectDto>(`${base}/projects/${id}`, b),
      remove: (id: string) => http.del<Ok>(`${base}/projects/${id}`),
      complete: (id: string, b: CompleteProjectBody) =>
        http.post<{ project: ProjectDto; carriedOver: number }>(`${base}/projects/${id}/complete`, b),
      reopen: (id: string) => http.post<ProjectDto>(`${base}/projects/${id}/reopen`),
      saveAsTemplate: (id: string, b: SaveAsTemplateBody) => http.post<TemplateDto>(`${base}/projects/${id}/save-as-template`, b),
      stats: (id: string) => http.get<ProjectStatsDto>(`${base}/projects/${id}/stats`),
    },
    cards: {
      list: (p: ListCardsParams = {}) => http.get<CardDto[]>(`${base}/cards${qs(p)}`),
      get: (id: string) => http.get<CardDto>(`${base}/cards/${id}`),
      create: (b: CreateCardBody) => http.post<CardDto>(`${base}/cards`, b),
      update: (id: string, b: UpdateCardBody) => http.patch<CardDto>(`${base}/cards/${id}`, b),
      remove: (id: string) => http.del<Ok>(`${base}/cards/${id}`),
      transition: (id: string, b: TransitionBody) => http.post<CardDto>(`${base}/cards/${id}/transition`, b),
      setPrimary: (id: string, b: SetPrimaryBody) => http.post<CardDto>(`${base}/cards/${id}/primary`, b),
      link: (id: string, projectId: string) => http.post<CardDto>(`${base}/cards/${id}/links`, { projectId }),
      unlink: (id: string, projectId: string) => http.del<CardDto>(`${base}/cards/${id}/links/${projectId}`),
    },
  }
}
