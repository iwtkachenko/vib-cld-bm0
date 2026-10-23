import { ObjectId, type ClientSession } from 'mongodb'
import { linearTransitions, type StatusDef } from '@pm/shared'
import type { CardTypeDoc, FlowDoc, ProjectDoc, TemplateDoc } from '../models'
import type { TeamScope } from '../tenancy'

const status = (id: string, name: string, category: StatusDef['category'], color: string): StatusDef => ({ id, name, category, color })

/** Opt-in sample configuration: card types, flows, a Sprint template and a Backlog project. */
export async function createStarterKit(ts: TeamScope, session: ClientSession): Promise<void> {
  const now = new Date()
  const basicStatuses = [status('todo', 'To Do', 'todo', 'gray'), status('doing', 'In Progress', 'in_progress', 'blue'), status('done', 'Done', 'done', 'green')]
  const devStatuses = [
    status('backlog', 'Backlog', 'todo', 'gray'), status('doing', 'In Progress', 'in_progress', 'blue'),
    status('review', 'In Review', 'in_progress', 'violet'), status('done', 'Done', 'done', 'green'),
  ]
  const flow = (name: string, description: string, statuses: StatusDef[]): Omit<FlowDoc, 'teamId'> => ({
    _id: new ObjectId(), name, description, statuses, initialStatusId: statuses[0]!.id, transitions: linearTransitions(statuses), createdAt: now,
  })
  const basic = flow('Basic', 'To Do → In Progress → Done', basicStatuses)
  const dev = flow('Development', 'Backlog → In Progress → In Review → Done', devStatuses)
  await ts.flows.insertMany([basic, dev], { session })

  const type = (name: string, icon: string, color: string, description: string, fields: CardTypeDoc['fields'] = []): Omit<CardTypeDoc, 'teamId'> => ({
    _id: new ObjectId(), name, icon, color, description, fields, archivedAt: null, createdAt: now,
  })
  const task = type('Task', '✅', 'blue', 'A unit of work', [{ id: 'estimate', name: 'Estimate (points)', kind: 'number', required: false }])
  const bug = type('Bug', '🐞', 'red', 'Something is broken', [
    { id: 'severity', name: 'Severity', kind: 'select', options: ['Low', 'Medium', 'High', 'Critical'], required: false },
  ])
  const story = type('Story', '📖', 'violet', 'A user-facing capability')
  await ts.cardTypes.insertMany([task, bug, story], { session })

  const mapping = (flowId: ObjectId) => [task, bug, story].map((t) => ({ cardTypeId: t._id, flowId }))
  const template: Omit<TemplateDoc, 'teamId'> = {
    _id: new ObjectId(), name: 'Sprint', description: 'Two-week sprint', namePattern: 'Sprint {n}', durationDays: 14,
    typeFlows: mapping(dev._id),
    blueprints: [{
      id: 'planning', typeId: task._id, title: 'Sprint planning',
      body: '## Agenda\n\n- [ ] Review the backlog\n- [ ] Agree on the sprint goal\n- [ ] Pick the cards for the sprint\n',
    }],
    projectsCreated: 0, createdAt: now,
  }
  await ts.templates.insertOne(template, { session })

  const backlog: Omit<ProjectDoc, 'teamId'> = {
    _id: new ObjectId(), name: 'Backlog', description: 'Everything that is not planned yet', state: 'active',
    startDate: null, endDate: null, typeFlows: mapping(basic._id), templateId: null, createdBy: ts.user._id, createdAt: now, completedAt: null,
  }
  await ts.projects.insertOne(backlog, { session })
}
