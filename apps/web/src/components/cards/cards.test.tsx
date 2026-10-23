import { notifications } from '@mantine/notifications'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectBoardPage } from '../../pages/projects/ProjectBoardPage'
import { ProjectListPage } from '../../pages/projects/ProjectListPage'
import { CardModalHost } from './CardModal'
import { NewCardModal } from './NewCardModal'
import {
  allByTestId, byTestId, click, createDb, IDS, installFakeApi, renderApp, typeInto, waitFor, type Db, type Rendered,
} from './testing'

let db: Db
let app: Rendered | null = null

beforeEach(() => {
  db = createDb()
  installFakeApi(db)
})
afterEach(() => {
  app?.unmount()
  app = null
  notifications.clean() // the notification store is a module singleton shared by all tests
  document.body.innerHTML = ''
})

/** Options of the dropdown that the given select input controls (other selects keep their closed lists mounted). */
const optionsOf = (input: HTMLElement | null) => {
  const list = input?.getAttribute('aria-controls') ? document.getElementById(input.getAttribute('aria-controls')!) : null
  const options = list ? [...list.querySelectorAll<HTMLElement>('[role="option"]')] : []
  return options.length ? options : null
}

const BASE = `/t/${IDS.team}/projects/${IDS.sprint}`
const routes = [
  {
    path: '/t/:teamId/projects/:projectId',
    children: [
      { path: 'board', element: <><ProjectBoardPage /><CardModalHost /></> },
      { path: 'list', element: <><ProjectListPage /><CardModalHost /></> },
    ],
  },
]

const titles = (root: ParentNode = document) => allByTestId('card-tile', root).map((t) => t.querySelector('p, div > p')?.textContent)
const tileText = (cardKey: string) => document.querySelector<HTMLElement>(`[data-testid="card-tile"][data-card-key="${cardKey}"]`)?.textContent ?? ''
const call = (method: string, path: string) => db.calls.filter((c) => c.method === method && c.path === path)
const search = () => app!.router.state.location.search
const blur = async (el: HTMLElement) => act(async () => { el.focus(); el.blur() })

async function openBoard() {
  app = renderApp(`${BASE}/board`, routes)
  await waitFor(() => allByTestId('card-tile').length === 4, 'four tiles')
}
async function openCardOnBoard(key: string) {
  await openBoard()
  await click(document.querySelector(`[data-testid="card-tile"][data-card-key="${key}"]`))
  await waitFor(() => byTestId('card-title'), 'card modal title')
}

describe('ProjectBoardPage', () => {
  it('renders one section per flow with ordered columns, counts and linked-card badges', async () => {
    await openBoard()
    expect(document.body.textContent).toContain('Dev flow')
    expect(document.body.textContent).toContain('Bug flow')
    // mapped types in the section header
    const dev = byTestId(`board-section-${IDS.flowDev}`)!
    expect(dev.textContent).toContain('Task')
    // columns in flow order
    const cols = allByTestId('board-column-todo').concat(allByTestId('board-column-doing'), allByTestId('board-column-done'))
    expect(cols.map((c) => c.getAttribute('data-category'))).toEqual(['todo', 'in_progress', 'done'])
    // ordered by rank: a0 (ACME-1) before a2 (ACME-4)
    const todo = byTestId('board-column-todo')!
    expect([...todo.querySelectorAll('[data-testid="card-tile"]')].map((t) => t.getAttribute('data-card-key'))).toEqual(['ACME-1', 'ACME-4'])
    expect(byTestId('board-count-todo')!.textContent).toBe('2')
    expect(byTestId('board-count-done')!.textContent).toBe('0')
    expect(byTestId('board-column-open')!.textContent).toContain('Crash on save')
    // card whose primary project is another one
    expect(tileText('ACME-4')).toContain('from Backlog')
    expect(tileText('ACME-1')).not.toContain('from ')
    expect(titles().length).toBe(4)
  })

  it('filters by search, only-my-cards and type', async () => {
    await openBoard()
    await typeInto(byTestId('board-search') as HTMLInputElement, 'login')
    expect(allByTestId('card-tile').map((t) => t.getAttribute('data-card-key'))).toEqual(['ACME-2'])
    await typeInto(byTestId('board-search') as HTMLInputElement, 'acme-3')
    expect(allByTestId('card-tile').map((t) => t.getAttribute('data-card-key'))).toEqual(['ACME-3'])
    await typeInto(byTestId('board-search') as HTMLInputElement, '')
    await click(byTestId('board-only-mine'))
    expect(allByTestId('card-tile').map((t) => t.getAttribute('data-card-key'))).toEqual(['ACME-1']) // assigned to Ann
  })

  it('shows the empty message for a flow without cards', async () => {
    db.cards = db.cards.filter((c) => c.flowId !== IDS.flowBug)
    app = renderApp(`${BASE}/board`, routes)
    await waitFor(() => byTestId('board-section-empty'), 'empty section')
    expect(byTestId('board-section-empty')!.textContent).toContain('No cards yet')
  })

  it('opens the card modal from a tile', async () => {
    await openCardOnBoard('ACME-1')
    expect(search()).toBe(`?card=${IDS.c1}`)
    expect(byTestId('card-modal')).not.toBeNull()
    expect(byTestId('card-meta')!.textContent).toContain('Created by Ann Lee')
    expect(byTestId('card-meta')!.textContent).toContain('Updated')
    expect((byTestId('card-title') as HTMLTextAreaElement).value).toBe('Write docs')
    expect(byTestId('card-key')!.textContent).toBe('ACME-1')
    const view = await waitFor(() => byTestId('md-view'), 'rendered description')
    expect(view.querySelector('h1')?.textContent).toBe('Docs')
    expect(view.querySelectorAll('input[type="checkbox"]').length).toBe(2)
  })

  it('creates a card from the toolbar button (new-card modal)', async () => {
    await openBoard()
    await click(byTestId('new-card'))
    await waitFor(() => byTestId('new-card-title'), 'new card modal')
    // empty title is rejected client-side
    await click(byTestId('new-card-submit'))
    expect(byTestId('new-card-modal')!.textContent).toContain('Title is required')
    expect(call('POST', '/cards')).toHaveLength(0)
  })
})

describe('NewCardModal', () => {
  const modalRoutes = [
    {
      path: '/t/:teamId/projects/:projectId/board',
      element: <NewCardModal opened onClose={() => {}} projectId={IDS.sprint} defaultTypeId={IDS.bug} />,
    },
  ]

  it('preselects the default type and posts the new card', async () => {
    app = renderApp(`${BASE}/board`, modalRoutes)
    const title = (await waitFor(() => byTestId('new-card-title'), 'title input')) as HTMLInputElement
    expect(document.activeElement).toBe(title)
    expect((byTestId('new-card-type') as HTMLInputElement).value).toContain('Bug')
    expect(byTestId('new-card-fields')).toBeNull() // Bug has no custom fields
    await typeInto(title, '  Brand new bug ')
    await click(byTestId('new-card-submit'))
    await waitFor(() => call('POST', '/cards').length === 1, 'create request')
    expect(call('POST', '/cards')[0]!.body).toEqual({
      projectId: IDS.sprint, typeId: IDS.bug, title: 'Brand new bug', body: '', fields: {}, assigneeIds: [],
    })
    await waitFor(() => document.body.textContent?.includes('ACME-5 created'), 'success notification')
  })

  it('renders custom fields of the default type and validates required ones', async () => {
    app?.unmount()
    app = renderApp(`${BASE}/board`, [
      {
        path: '/t/:teamId/projects/:projectId/board',
        element: <NewCardModal opened onClose={() => {}} projectId={IDS.sprint} defaultTypeId={IDS.task} />,
      },
    ])
    const title = (await waitFor(() => byTestId('new-card-title'), 'title input')) as HTMLInputElement
    expect(byTestId('new-card-fields')).not.toBeNull()
    for (const f of ['est', 'prio', 'note', 'due', 'blocked']) expect(byTestId(`field-${f}`), f).not.toBeNull()
    await typeInto(title, 'Needs priority')
    await click(byTestId('new-card-submit'))
    expect(byTestId('new-card-fields')!.textContent).toContain('Required')
    expect(call('POST', '/cards')).toHaveLength(0)

    // pick the priority, fill a number and a text field, then submit: empty values are omitted
    await click(byTestId('field-prio'))
    const option = await waitFor(() => optionsOf(byTestId('field-prio'))?.find((o) => o.textContent === 'High'), 'High option')
    await click(option)
    await typeInto(byTestId('field-est') as HTMLInputElement, '5')
    await click(byTestId('new-card-submit'))
    await waitFor(() => call('POST', '/cards').length === 1, 'create request')
    expect(call('POST', '/cards')[0]!.body).toMatchObject({ typeId: IDS.task, title: 'Needs priority', fields: { prio: 'High', est: 5 } })
    expect(Object.keys((call('POST', '/cards')[0]!.body as { fields: object }).fields).sort()).toEqual(['est', 'prio'])
  })

  it('refuses to create cards in an archived project', async () => {
    app = renderApp(`${BASE}/board`, [
      {
        path: '/t/:teamId/projects/:projectId/board',
        element: <NewCardModal opened onClose={() => {}} projectId={IDS.old} />,
      },
    ])
    await waitFor(() => byTestId('new-card-modal')?.textContent?.includes('archived'), 'archived notice')
    expect((byTestId('new-card-submit') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('CardModalHost', () => {
  it('renders status transitions allowed by the flow and applies one with the expected status', async () => {
    await openCardOnBoard('ACME-1')
    const status = byTestId('card-status')!
    expect(byTestId('status-target-doing')).not.toBeNull()
    expect(byTestId('status-target-done')).toBeNull() // todo -> done is not in the flow
    expect(status.textContent).toContain('To do')
    await click(byTestId('status-target-doing'))
    await waitFor(() => call('POST', `/cards/${IDS.c1}/transition`).length === 1, 'transition request')
    expect(call('POST', `/cards/${IDS.c1}/transition`)[0]!.body).toEqual({ expectedStatusId: 'todo', toStatusId: 'doing' })
    await waitFor(() => byTestId('card-status')!.textContent!.includes('Doing') && byTestId('status-target-done'), 'refreshed status')
    expect(byTestId('status-target-todo')).not.toBeNull()
  })

  it('saves the title on blur and ignores an emptied title', async () => {
    await openCardOnBoard('ACME-1')
    const title = byTestId('card-title') as HTMLTextAreaElement
    await typeInto(title, 'Write better docs')
    await blur(title)
    await waitFor(() => call('PATCH', `/cards/${IDS.c1}`).length === 1, 'title patch')
    expect(call('PATCH', `/cards/${IDS.c1}`)[0]!.body).toEqual({ title: 'Write better docs' })

    await typeInto(title, '   ')
    await blur(title)
    expect(call('PATCH', `/cards/${IDS.c1}`)).toHaveLength(1)
    await waitFor(() => (byTestId('card-title') as HTMLTextAreaElement).value === 'Write better docs', 'title restored')
  })

  it('edits the description (markdown mode) and saves it', async () => {
    await openCardOnBoard('ACME-1')
    await click(byTestId('card-body-edit'))
    const markdownTab = await waitFor(() => byTestId('md-mode-markdown'), 'lazy editor')
    expect((byTestId('card-body-save') as HTMLButtonElement).disabled).toBe(true) // nothing changed yet
    await click(markdownTab)
    const source = byTestId('md-source') as HTMLTextAreaElement
    // untouched content is the original markdown, not a re-serialization
    expect(source.value).toBe(db.bodies[IDS.c1])
    await typeInto(source, 'Plain new description')
    expect((byTestId('card-body-save') as HTMLButtonElement).disabled).toBe(false)
    await click(byTestId('card-body-save'))
    await waitFor(() => call('PATCH', `/cards/${IDS.c1}`).length === 1, 'body patch')
    expect(call('PATCH', `/cards/${IDS.c1}`)[0]!.body).toEqual({ body: 'Plain new description' })
    await waitFor(() => !byTestId('card-body-save') && byTestId('md-view')?.textContent?.includes('Plain new description'), 'view mode')
  })

  it('asks before discarding a dirty description', async () => {
    await openCardOnBoard('ACME-1')
    await click(byTestId('card-body-edit'))
    await click(await waitFor(() => byTestId('md-mode-markdown'), 'lazy editor'))
    await typeInto(byTestId('md-source') as HTMLTextAreaElement, 'changed')
    await click(byTestId('card-body-cancel'))
    await waitFor(() => document.body.textContent?.includes('Discard changes?'), 'confirm dialog')
    expect(byTestId('card-body-save')).not.toBeNull() // still editing
    await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Discard') ?? null)
    await waitFor(() => !byTestId('card-body-save'), 'editor closed')
    expect(call('PATCH', `/cards/${IDS.c1}`)).toHaveLength(0)
  })

  it('also guards closing the modal while the description is dirty', async () => {
    await openCardOnBoard('ACME-1')
    await click(byTestId('card-body-edit'))
    await click(await waitFor(() => byTestId('md-mode-markdown'), 'lazy editor'))
    await typeInto(byTestId('md-source') as HTMLTextAreaElement, 'changed')
    await click(byTestId('card-close'))
    await waitFor(() => document.body.textContent?.includes('Discard unsaved changes?'), 'confirm dialog')
    expect(search()).toBe(`?card=${IDS.c1}`)
    await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Discard') ?? null)
    await waitFor(() => search() === '', 'modal closed')
  })

  it('saves assignee changes immediately', async () => {
    await openCardOnBoard('ACME-1')
    const input = document.querySelector<HTMLInputElement>('[data-testid="card-assignees"] input')!
    await click(input)
    const option = await waitFor(() => optionsOf(input)?.find((o) => o.textContent?.includes('Bob Stone')), 'Bob option')
    await click(option)
    await waitFor(() => call('PATCH', `/cards/${IDS.c1}`).length === 1, 'assignee patch')
    expect(call('PATCH', `/cards/${IDS.c1}`)[0]!.body).toEqual({ assigneeIds: [IDS.ann, IDS.bob] })
    await waitFor(() => byTestId('card-assignees')!.textContent!.includes('Bob Stone'), 'assignee shown')
  })

  it('saves custom fields on blur / change and clears with null', async () => {
    await openCardOnBoard('ACME-1')
    const est = byTestId('field-est') as HTMLInputElement
    await typeInto(est, '8')
    await blur(est)
    await waitFor(() => call('PATCH', `/cards/${IDS.c1}`).length === 1, 'number patch')
    expect(call('PATCH', `/cards/${IDS.c1}`)[0]!.body).toEqual({ fields: { est: 8 } })

    const blocked = byTestId('field-blocked') as HTMLInputElement
    await click(blocked)
    await waitFor(() => call('PATCH', `/cards/${IDS.c1}`).length === 2, 'checkbox patch')
    expect(call('PATCH', `/cards/${IDS.c1}`)[1]!.body).toEqual({ fields: { blocked: true } })

    await waitFor(() => (byTestId('field-est') as HTMLInputElement).value === '8', 'number persisted')
    await typeInto(byTestId('field-est') as HTMLInputElement, '')
    await blur(byTestId('field-est')!)
    await waitFor(() => call('PATCH', `/cards/${IDS.c1}`).length === 3, 'clear patch')
    expect(call('PATCH', `/cards/${IDS.c1}`)[2]!.body).toEqual({ fields: { est: null } })
  })

  it('manages projects: primary badge, make primary, unlink, link and move', async () => {
    await openCardOnBoard('ACME-4')
    let rows = allByTestId('card-project-row')
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('Backlog'), expect.stringContaining('Sprint 1')])
    expect(rows[0]!.textContent).toContain('Primary')
    expect(rows[1]!.textContent).not.toContain('Primary')
    expect(rows[0]!.querySelector('[data-testid="unlink-project"]')).toBeNull() // the primary cannot be unlinked

    await click(rows[1]!.querySelector('[data-testid="make-primary"]'))
    await waitFor(() => call('POST', `/cards/${IDS.c4}/primary`).length === 1, 'primary request')
    expect(call('POST', `/cards/${IDS.c4}/primary`)[0]!.body).toEqual({ projectId: IDS.sprint, keepPreviousLink: true })
    await waitFor(() => allByTestId('card-project-row')[0]!.textContent!.includes('Sprint 1'), 'primary switched')

    rows = allByTestId('card-project-row')
    await click(rows[1]!.querySelector('[data-testid="unlink-project"]'))
    await waitFor(() => call('DELETE', `/cards/${IDS.c4}/links/${IDS.backlog}`).length === 1, 'unlink request')
  })

  it('links to another active project and moves to a project that maps the card type', async () => {
    await openCardOnBoard('ACME-1')
    // link: only active projects the card is not yet in (Backlog; Old sprint is archived)
    await click(byTestId('link-project-select'))
    const options = await waitFor(() => optionsOf(byTestId('link-project-select')), 'link options')
    expect(options.map((o) => o.textContent)).toEqual(['Backlog'])
    await click(options[0]!)
    await waitFor(() => call('POST', `/cards/${IDS.c1}/links`).length === 1, 'link request')
    expect(call('POST', `/cards/${IDS.c1}/links`)[0]!.body).toEqual({ projectId: IDS.backlog })

    // move: helper text explains the flow change; only projects mapping the type
    const move = byTestId('move-project-select')!
    expect(byTestId('card-projects')!.textContent).toContain("follows the target project's flow")
    await click(move)
    const moveOptions = await waitFor(() => optionsOf(move), 'move options')
    expect(moveOptions.map((o) => o.textContent)).toEqual(['Backlog'])
    await click(moveOptions[0]!)
    await waitFor(() => call('POST', `/cards/${IDS.c1}/primary`).length === 1, 'move request')
    expect(call('POST', `/cards/${IDS.c1}/primary`)[0]!.body).toEqual({ projectId: IDS.backlog, keepPreviousLink: false })
  })

  it('deletes after confirmation and closes without a "not found" notification', async () => {
    await openCardOnBoard('ACME-3')
    await click(byTestId('card-delete'))
    await waitFor(() => document.body.textContent?.includes('This cannot be undone'), 'confirm dialog')
    await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Delete') ?? null)
    await waitFor(() => call('DELETE', `/cards/${IDS.c3}`).length === 1, 'delete request')
    await waitFor(() => search() === '', 'modal closed')
    await waitFor(() => allByTestId('card-tile').length === 3, 'tile removed')
    expect(document.body.textContent).not.toContain('Card not found')
  })

  it('shows a notification and closes for an unknown card id', async () => {
    app = renderApp(`${BASE}/board?card=${'f'.repeat(24)}`, routes)
    await waitFor(() => document.body.textContent?.includes('Card not found'), 'not found notification')
    await waitFor(() => search() === '', 'modal closed')
  })
})

describe('ProjectListPage', () => {
  async function openList() {
    app = renderApp(`${BASE}/list`, routes)
    await waitFor(() => allByTestId('list-row').length === 4, 'four rows')
  }
  const keys = () => allByTestId('list-row').map((r) => r.getAttribute('data-card-key'))

  it('lists cards by number descending with type, status and updated columns', async () => {
    await openList()
    expect(keys()).toEqual(['ACME-4', 'ACME-3', 'ACME-2', 'ACME-1'])
    const row = byTestId('list-row')!.parentElement!.querySelector('[data-card-key="ACME-2"]')!
    expect(row.textContent).toContain('Fix login')
    expect(row.textContent).toContain('Doing')
    expect(row.textContent).toContain('Task')
    expect(row.textContent).toMatch(/ago|in a few seconds|a few seconds/)
  })

  it('filters by search, status category and assignee (me / unassigned)', async () => {
    await openList()
    await typeInto(byTestId('list-search') as HTMLInputElement, 'crash')
    expect(keys()).toEqual(['ACME-3'])
    await typeInto(byTestId('list-search') as HTMLInputElement, 'nothing matches this')
    await waitFor(() => document.body.textContent?.includes('No cards match your filters'), 'filtered-empty state')
    await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Clear filters') ?? null)
    await waitFor(() => allByTestId('list-row').length === 4, 'rows back')

    const pick = async (testId: string, label: string) => {
      await click(byTestId(testId))
      const opt = await waitFor(() => optionsOf(byTestId(testId))?.find((o) => o.textContent === label), `${label} option`)
      await click(opt)
    }
    await pick('list-assignee-filter', 'Unassigned')
    expect(keys()).toEqual(['ACME-4', 'ACME-3'])
    await pick('list-assignee-filter', 'Me')
    expect(keys()).toEqual(['ACME-1'])
    await pick('list-assignee-filter', 'Bob Stone')
    expect(keys()).toEqual(['ACME-2'])
    await pick('list-category-filter', 'Done')
    await waitFor(() => document.body.textContent?.includes('No cards match your filters'), 'no done cards for Bob')
  })

  it('opens the card modal on row click', async () => {
    await openList()
    await click(document.querySelector('[data-testid="list-row"][data-card-key="ACME-2"]'))
    await waitFor(() => byTestId('card-title'), 'card modal')
    expect(search()).toBe(`?card=${IDS.c2}`)
  })

  it('shows the empty state for a project without cards', async () => {
    db.cards = []
    app = renderApp(`${BASE}/list`, routes)
    await waitFor(() => document.body.textContent?.includes('No cards yet'), 'empty state')
    expect(byTestId('new-card')).not.toBeNull()
  })

  it('disables "New card" for archived projects', async () => {
    app = renderApp(`/t/${IDS.team}/projects/${IDS.old}/list`, routes)
    await waitFor(() => byTestId('new-card'), 'new-card button')
    await waitFor(() => (byTestId('new-card') as HTMLButtonElement).disabled, 'disabled')
  })
})
