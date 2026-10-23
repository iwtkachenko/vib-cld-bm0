# Projects — multi-tenant project management

Teams collaborate on **projects** made of **cards**. Teams define their own **card types** (with custom fields) and
**status flows**; a project is just a combination "card type → flow", so projects are cheap, ephemeral and can be
stamped out from **templates** (e.g. *Sprint 12*, with its planning card already on the board).

TypeScript end to end: Fastify + MongoDB + Redis on the server, React + Mantine on the client, shared zod schemas
and domain logic in between.

## Quick start

Prerequisites: Node ≥ 22.22, npm, Docker (OrbStack/Docker Desktop).

```bash
npm install
npm run infra:up      # MongoDB (replica set), Redis, Mailpit — waits until healthy
npm run dev           # API on :4000, web on :5173
```

Open <http://localhost:5173>, sign up, create a team (tick **starter kit** to get Task/Bug/Story types, two flows,
a *Sprint* template and a *Backlog* project). Outgoing e-mail (verification, invitations) lands in Mailpit at
<http://localhost:8026>.

| Script | What it does |
| --- | --- |
| `npm run infra:up / infra:down / infra:reset / infra:logs / infra:ps` | manage the docker compose services (`reset` also deletes the data volumes) |
| `bash scripts/infra.sh mongo` / `redis` | open `mongosh` / `redis-cli` inside the containers |
| `npm run dev` | API (tsx watch) + Vite dev server with `/api` proxy |
| `npm run typecheck` | `tsc` for every workspace (TypeScript 7) |
| `npm test` | unit + integration tests (needs `infra:up`; every test file uses a throw-away database and Redis prefix) |
| `npm run smoke` | end-to-end smoke test against a **running** server (see below) |
| `npm run build` / `npm start` | production build; the API then serves the SPA too on <http://localhost:4000> |

### Smoke test

```bash
npm run infra:up && npm run dev        # terminal 1
SMOKE_WEB=http://localhost:5173 npm run smoke   # terminal 2 (SMOKE_WEB additionally checks the Vite proxy)
# or against the production build:
npm run build && npm start             # terminal 1
npm run smoke                          # terminal 2
```

It drives the real HTTP API with three fresh users per run: registration and e-mail verification (token read from
Mailpit), team + card types + restricted flows + sprint template, a sprint created from the template with new / moved
/ linked cards, assignment, allowed/forbidden/stale status transitions, linking and primary-project changes, project
statistics, invitations by e-mail (accept / reject / unverified), tenant isolation and completing a sprint with
carry-over. Exit code 0 means everything works.

### Configuration

Copy `.env.example` to `.env` (the infra script does it for you). Host ports are deliberately non-standard
(Mongo 27018, Redis 6380, SMTP 1026, Mailpit UI 8026) so they don't collide with local installs; change them in
`.env`. `APP_URL` is used for links in e-mails — set it to `http://localhost:4000` when running the production build.

## Features → where to find them

| Requirement | Implementation |
| --- | --- |
| Create card types and status flows | **Card types** and **Flows** pages (custom fields; statuses with categories; transition matrix with presets) |
| Create and manage projects combining card types and flows | **Projects** → wizard / **Settings** tab (type → flow mapping, complete, reopen, delete) |
| Create cards, edit, pass through statuses | board (drag & drop, only along allowed transitions), list view, card modal |
| Assign cards to users | assignees in the card modal / creation dialog |
| Project statistics | project **Stats** tab: totals, status / type / assignee breakdowns, burn-up |
| Project templates | **Templates** page, *Save as template* in project settings |
| Add tasks to new projects right away | wizard step 2: template blueprint cards, quick-add new cards, move or link existing cards |
| Invite by e-mail / accept or reject / switch teams | **Team** settings, **Invitations** page, team switcher in the header |
| Markdown card bodies | WYSIWYG (TipTap) with a switch to raw markdown text |

### Domain rules worth knowing

* A card has **one primary project** and any number of linked projects. The card's **flow always follows its primary
  project's mapping**; changing the primary project (or the project's mapping) re-maps the status (same status id →
  first status of the same category → initial status). Ordering on a board is per project.
* A status change must follow the flow's transitions; the API also checks the status the client last saw
  (`expectedStatusId`) so a stale board can't silently overwrite someone else's move.
* Completing a project archives it and can carry unfinished cards over to another project; statistics of an archived
  project are frozen "as of" its completion.
* Invitations are matched by e-mail address. To prevent hijacking an invite by registering someone else's address, an
  account must verify its e-mail (link sent through Mailpit in dev) before it can see or answer invitations.
* Tenant isolation: every query is scoped by `teamId` (`apps/api/src/tenancy.ts`), non-members get 404 before any
  validation runs, and every id inside a request body is checked to belong to the team.

## Architecture

```
docker-compose.yml        mongo:8.0 (single-node replica set → transactions), redis:8, mailpit
packages/shared           zod schemas, DTO types, pure domain logic (flows, fields, templates, ranks, burn-up) + tests
apps/api                  Fastify 5 · fastify-type-provider-zod · mongodb driver · ioredis (sessions, rate limits)
  src/routes              HTTP layer (guards run in preValidation)
  src/services            cards / projects / stats / teams logic (multi-document changes run in transactions)
  test                    integration tests (real Mongo + Redis through fastify.inject)
apps/web                  React 19 · Vite 8 · Mantine 9 · TanStack Query · React Router 8 · TipTap 3
scripts                   infra.sh (compose wrapper), smoke.ts
```

* **Auth**: e-mail + password (scrypt), opaque session token in an httpOnly `SameSite=Lax` cookie, session state in
  Redis (sliding TTL). Login/registration are rate limited per IP (Redis).
* **Data**: collections `users, teams, memberships, invitations, cardTypes, flows, projects, templates, cards,
  counters`; all tenant documents carry `teamId` and are indexed with it. Card numbers (`ACME-42`) come from an atomic
  per-team counter. Card ranks use fractional indexing with jitter so concurrent appends never collide.
* **Mongo replica set**: transactions need one, so compose starts `mongod --replSet rs0` and the healthcheck initiates
  it. Connect with `?directConnection=true` (already in the default URL).

## Limitations / not included

No realtime push (data refreshes on focus and on navigation), no password reset, no comments/attachments/activity log,
no demo seed data, e-mail is dev-only (Mailpit; point `SMTP_*` at a real relay for production), the app itself is not
containerised (only the infrastructure is).
