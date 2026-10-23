import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import {
  completeProjectInput, createProjectInput, listProjectsQuery, saveAsTemplateInput, updateProjectInput,
} from '@pm/shared'
import { projectDto, templateDto } from '../serialize'
import {
  completeProject, createProject, deleteProject, loadProject, projectCounts, reopenProject, saveProjectAsTemplate, updateProject,
} from '../services/projects'
import { projectStats } from '../services/stats'
import { tscope } from './guard'

const idParams = z.object({ id: z.string() })

export const projectRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/projects', { schema: { querystring: listProjectsQuery } }, async (req) => {
    const ts = tscope(req)
    const projects = await ts.projects.find(req.query.state ? { state: req.query.state } : {}, { sort: { createdAt: -1 } }).toArray()
    const counts = await projectCounts(ts, projects.map((p) => p._id))
    return projects.map((p) => projectDto(p, counts.get(p._id.toHexString()) ?? { total: 0, done: 0 }))
  })

  app.post('/projects', { schema: { body: createProjectInput } }, async (req, reply) => {
    const r = await createProject(tscope(req), req.body)
    return reply.status(201).send({ project: projectDto(r.project), created: r.created, linked: r.linked, moved: r.moved })
  })

  app.get('/projects/:id', { schema: { params: idParams } }, async (req) => {
    const ts = tscope(req)
    const p = await loadProject(ts, req.params.id)
    return projectDto(p, (await projectCounts(ts, [p._id])).get(p._id.toHexString()) ?? { total: 0, done: 0 })
  })

  app.patch('/projects/:id', { schema: { params: idParams, body: updateProjectInput } }, async (req) => {
    const ts = tscope(req)
    return projectDto(await updateProject(ts, await loadProject(ts, req.params.id), req.body))
  })

  app.delete('/projects/:id', { schema: { params: idParams } }, async (req) => {
    const ts = tscope(req)
    await deleteProject(ts, await loadProject(ts, req.params.id))
    return { ok: true }
  })

  app.post('/projects/:id/complete', { schema: { params: idParams, body: completeProjectInput } }, async (req) => {
    const ts = tscope(req)
    const r = await completeProject(ts, await loadProject(ts, req.params.id), req.body.carryOverToProjectId)
    return { project: projectDto(r.project), carriedOver: r.carriedOver }
  })

  app.post('/projects/:id/reopen', { schema: { params: idParams } }, async (req) => {
    const ts = tscope(req)
    return projectDto(await reopenProject(ts, await loadProject(ts, req.params.id)))
  })

  app.post('/projects/:id/save-as-template', { schema: { params: idParams, body: saveAsTemplateInput } }, async (req, reply) => {
    const ts = tscope(req)
    const t = await saveProjectAsTemplate(ts, await loadProject(ts, req.params.id), req.body)
    return reply.status(201).send(templateDto(t))
  })

  app.get('/projects/:id/stats', { schema: { params: idParams } }, async (req) => {
    const ts = tscope(req)
    return projectStats(ts, await loadProject(ts, req.params.id))
  })
}
