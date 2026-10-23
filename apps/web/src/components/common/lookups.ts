import { useMemo } from 'react'
import type { CardTypeDto, FlowDto, MemberDto, ProjectDto, StatusDef } from '@pm/shared'
import { useCardTypes, useFlows, useMembers, useProjects } from '../../api/queries'

/** Id → entity maps for the team's card types, flows, members and projects (all cached, shared across pages). */
export function useTeamLookups(teamId: string) {
  const types = useCardTypes(teamId)
  const flows = useFlows(teamId)
  const members = useMembers(teamId)
  const projects = useProjects(teamId)
  return useMemo(() => {
    const typesById = new Map<string, CardTypeDto>((types.data ?? []).map((t) => [t.id, t]))
    const flowsById = new Map<string, FlowDto>((flows.data ?? []).map((f) => [f.id, f]))
    const membersById = new Map<string, MemberDto>((members.data ?? []).map((m) => [m.userId, m]))
    const projectsById = new Map<string, ProjectDto>((projects.data ?? []).map((p) => [p.id, p]))
    const statusOf = (flowId: string, statusId: string): StatusDef | undefined => flowsById.get(flowId)?.statuses.find((s) => s.id === statusId)
    return {
      types: types.data ?? [], flows: flows.data ?? [], members: members.data ?? [], projects: projects.data ?? [],
      typesById, flowsById, membersById, projectsById, statusOf,
      isLoading: types.isPending || flows.isPending || members.isPending || projects.isPending,
    }
  }, [types.data, flows.data, members.data, projects.data, types.isPending, flows.isPending, members.isPending, projects.isPending])
}
