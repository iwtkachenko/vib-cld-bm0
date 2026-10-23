import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  CardTypeBody, CompleteProjectBody, CreateCardBody, CreateProjectBody, CreateTeamBody, FlowBody, ListCardsParams, LoginBody, MeDto,
  RegisterBody, Role, SaveAsTemplateBody, SetPrimaryBody, TemplateBody, TransitionBody, UpdateCardBody, UpdateProjectBody,
} from '@pm/shared'
import { ApiError } from './client'
import { authApi, meApi, teamApi } from './endpoints'

/** Query keys. Everything team-scoped lives under ['team', teamId, ...] so one prefix invalidates an area. */
export const qk = {
  me: ['me'] as const,
  myInvitations: ['my-invitations'] as const,
  team: (t: string, ...rest: unknown[]) => ['team', t, ...rest] as const,
}

type Area = 'info' | 'members' | 'invitations' | 'card-types' | 'flows' | 'templates' | 'projects' | 'cards'
function invalidate(qc: QueryClient, t: string, ...areas: Area[]) {
  return Promise.all(areas.map((a) => qc.invalidateQueries({ queryKey: qk.team(t, a) })))
}

/* ---------------------------------- session ---------------------------------- */

/** The signed-in user, or `null` when signed out. */
export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async (): Promise<MeDto | null> => {
      try {
        return await meApi.get()
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: 30_000,
    retry: false,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (b: LoginBody) => authApi.login(b), onSuccess: (me) => { qc.clear(); qc.setQueryData(qk.me, me) }, meta: { silent: true } })
}
export function useRegister() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (b: RegisterBody) => authApi.register(b), onSuccess: (me) => { qc.clear(); qc.setQueryData(qk.me, me) }, meta: { silent: true } })
}
export function useLogout() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: () => authApi.logout(), onSuccess: () => { qc.clear(); qc.setQueryData(qk.me, null) } })
}
export function useUpdateMe() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: meApi.update, onSuccess: (me) => qc.setQueryData(qk.me, me), meta: { silent: true } })
}
export function useResendVerification() {
  return useMutation({ mutationFn: () => authApi.resendVerification() })
}
export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (b: CreateTeamBody) => meApi.createTeam(b), onSuccess: ({ me }) => qc.setQueryData(qk.me, me) })
}

export function useMyInvitations(enabled = true) {
  return useQuery({ queryKey: qk.myInvitations, queryFn: meApi.invitations, enabled, refetchInterval: 60_000, retry: false })
}
export function useAcceptInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => meApi.accept(id),
    onSuccess: ({ me }) => { qc.setQueryData(qk.me, me); void qc.invalidateQueries({ queryKey: qk.myInvitations }) },
  })
}
export function useRejectInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => meApi.reject(id),
    onSuccess: ({ me }) => { qc.setQueryData(qk.me, me); void qc.invalidateQueries({ queryKey: qk.myInvitations }) },
  })
}

/* ------------------------------------ team ------------------------------------ */

export function useTeamInfo(t: string) {
  return useQuery({ queryKey: qk.team(t, 'info'), queryFn: () => teamApi(t).get() })
}
export function useUpdateTeam(t: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: { name?: string; key?: string }) => teamApi(t).update(b),
    onSuccess: () => Promise.all([invalidate(qc, t, 'info'), qc.invalidateQueries({ queryKey: qk.me })]),
  })
}
export function useMembers(t: string) {
  return useQuery({ queryKey: qk.team(t, 'members'), queryFn: () => teamApi(t).members() })
}
export function useSetRole(t: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (v: { userId: string; role: Role }) => teamApi(t).setRole(v.userId, v.role), onSuccess: () => invalidate(qc, t, 'members') })
}
export function useRemoveMember(t: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => teamApi(t).removeMember(userId),
    onSuccess: () => Promise.all([invalidate(qc, t, 'members', 'cards'), qc.invalidateQueries({ queryKey: qk.me })]),
  })
}
export function useTeamInvitations(t: string) {
  return useQuery({ queryKey: qk.team(t, 'invitations'), queryFn: () => teamApi(t).invitations() })
}
export function useInvite(t: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (email: string) => teamApi(t).invite(email), onSuccess: () => invalidate(qc, t, 'invitations') })
}
export function useRevokeInvitation(t: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => teamApi(t).revokeInvitation(id), onSuccess: () => invalidate(qc, t, 'invitations') })
}

/* ---------------------------- card types / flows / templates ---------------------------- */

export function useCardTypes(t: string) {
  return useQuery({ queryKey: qk.team(t, 'card-types'), queryFn: () => teamApi(t).cardTypes.list() })
}
export function useSaveCardType(t: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id?: string; body: CardTypeBody }) => (v.id ? teamApi(t).cardTypes.update(v.id, v.body) : teamApi(t).cardTypes.create(v.body)),
    onSuccess: () => invalidate(qc, t, 'card-types'),
  })
}
export function useArchiveCardType(t: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; archive: boolean }) => (v.archive ? teamApi(t).cardTypes.archive(v.id) : teamApi(t).cardTypes.unarchive(v.id)),
    onSuccess: () => invalidate(qc, t, 'card-types'),
  })
}
export function useDeleteCardType(t: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => teamApi(t).cardTypes.remove(id), onSuccess: () => invalidate(qc, t, 'card-types') })
}

export function useFlows(t: string) {
  return useQuery({ queryKey: qk.team(t, 'flows'), queryFn: () => teamApi(t).flows.list() })
}
export function useFlowUsage(t: string, id: string | undefined) {
  return useQuery({ queryKey: qk.team(t, 'flows', 'usage', id), queryFn: () => teamApi(t).flows.usage(id!), enabled: !!id })
}
export function useSaveFlow(t: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id?: string; body: FlowBody }) => (v.id ? teamApi(t).flows.update(v.id, v.body) : teamApi(t).flows.create(v.body)),
    onSuccess: () => invalidate(qc, t, 'flows', 'cards', 'projects'),
  })
}
export function useDeleteFlow(t: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => teamApi(t).flows.remove(id), onSuccess: () => invalidate(qc, t, 'flows') })
}

export function useTemplates(t: string) {
  return useQuery({ queryKey: qk.team(t, 'templates'), queryFn: () => teamApi(t).templates.list() })
}
export function useSaveTemplate(t: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id?: string; body: TemplateBody }) => (v.id ? teamApi(t).templates.update(v.id, v.body) : teamApi(t).templates.create(v.body)),
    onSuccess: () => invalidate(qc, t, 'templates'),
  })
}
export function useDeleteTemplate(t: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => teamApi(t).templates.remove(id), onSuccess: () => invalidate(qc, t, 'templates') })
}

/* --------------------------------- projects --------------------------------- */

export function useProjects(t: string, state?: 'active' | 'archived') {
  return useQuery({ queryKey: qk.team(t, 'projects', 'list', state ?? 'all'), queryFn: () => teamApi(t).projects.list(state) })
}
export function useProject(t: string, id: string | undefined) {
  return useQuery({ queryKey: qk.team(t, 'projects', 'detail', id), queryFn: () => teamApi(t).projects.get(id!), enabled: !!id })
}
export function useProjectStats(t: string, id: string | undefined) {
  return useQuery({ queryKey: qk.team(t, 'projects', 'stats', id), queryFn: () => teamApi(t).projects.stats(id!), enabled: !!id })
}
export function useCreateProject(t: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (b: CreateProjectBody) => teamApi(t).projects.create(b), onSuccess: () => invalidate(qc, t, 'projects', 'cards', 'templates') })
}
export function useUpdateProject(t: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; body: UpdateProjectBody }) => teamApi(t).projects.update(v.id, v.body),
    onSuccess: () => invalidate(qc, t, 'projects', 'cards'),
  })
}
export function useDeleteProject(t: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => teamApi(t).projects.remove(id), onSuccess: () => invalidate(qc, t, 'projects', 'cards') })
}
export function useCompleteProject(t: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; body: CompleteProjectBody }) => teamApi(t).projects.complete(v.id, v.body),
    onSuccess: () => invalidate(qc, t, 'projects', 'cards'),
  })
}
export function useReopenProject(t: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => teamApi(t).projects.reopen(id), onSuccess: () => invalidate(qc, t, 'projects') })
}
export function useSaveAsTemplate(t: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; body: SaveAsTemplateBody }) => teamApi(t).projects.saveAsTemplate(v.id, v.body),
    onSuccess: () => invalidate(qc, t, 'templates'),
  })
}

/* ----------------------------------- cards ----------------------------------- */

export function useCards(t: string, params: ListCardsParams = {}, enabled = true) {
  return useQuery({ queryKey: qk.team(t, 'cards', 'list', params), queryFn: () => teamApi(t).cards.list(params), enabled })
}
export function useCard(t: string, id: string | undefined) {
  return useQuery({ queryKey: qk.team(t, 'cards', 'detail', id), queryFn: () => teamApi(t).cards.get(id!), enabled: !!id })
}
export function useCreateCard(t: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (b: CreateCardBody) => teamApi(t).cards.create(b), onSuccess: () => invalidate(qc, t, 'cards', 'projects') })
}
export function useUpdateCard(t: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; body: UpdateCardBody }) => teamApi(t).cards.update(v.id, v.body),
    onSuccess: () => invalidate(qc, t, 'cards'),
  })
}
export function useDeleteCard(t: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => teamApi(t).cards.remove(id), onSuccess: () => invalidate(qc, t, 'cards', 'projects') })
}
/** No automatic cache handling for failures: board code may apply optimistic updates and roll back itself. */
export function useTransitionCard(t: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; body: TransitionBody }) => teamApi(t).cards.transition(v.id, v.body),
    onSettled: () => invalidate(qc, t, 'cards', 'projects'),
  })
}
export function useSetPrimary(t: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; body: SetPrimaryBody }) => teamApi(t).cards.setPrimary(v.id, v.body),
    onSuccess: () => invalidate(qc, t, 'cards', 'projects'),
  })
}
export function useLinkCard(t: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; projectId: string }) => teamApi(t).cards.link(v.id, v.projectId),
    onSuccess: () => invalidate(qc, t, 'cards', 'projects'),
  })
}
export function useUnlinkCard(t: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; projectId: string }) => teamApi(t).cards.unlink(v.id, v.projectId),
    onSuccess: () => invalidate(qc, t, 'cards', 'projects'),
  })
}
