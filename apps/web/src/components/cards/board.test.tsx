/* Drag-and-drop logic of the board. @hello-pangea/dnd needs real layout, so it is replaced by a stub that hands the
 * test its DragDropContext callbacks; everything else (queries, optimistic update, rollback, requests) is real. */
import { notifications } from '@mantine/notifications'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rankBetween } from '@pm/shared'
import { ProjectBoardPage } from '../../pages/projects/ProjectBoardPage'
import { allByTestId, byTestId, createDb, IDS, installFakeApi, renderApp, waitFor, type Db, type Rendered } from './testing'

const dnd = vi.hoisted(() => ({
  onDragStart: null as null | ((e: unknown) => void),
  onDragEnd: null as null | ((e: unknown) => void),
}))

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, onDragStart, onDragEnd }: { children: React.ReactNode; onDragStart: (e: unknown) => void; onDragEnd: (e: unknown) => void }) => {
    dnd.onDragStart = onDragStart
    dnd.onDragEnd = onDragEnd
    return children
  },
  Droppable: ({ children, droppableId, type, isDropDisabled }: { children: (p: unknown, s: unknown) => React.ReactNode; droppableId: string; type: string; isDropDisabled: boolean }) =>
    children(
      { innerRef: () => {}, droppableProps: { 'data-droppable-id': droppableId, 'data-droppable-type': type, 'data-disabled': String(!!isDropDisabled) }, placeholder: null },
      { isDraggingOver: false },
    ),
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => React.ReactNode }) =>
    children({ innerRef: () => {}, draggableProps: { style: undefined }, dragHandleProps: { role: 'button', tabIndex: 0 } }, { isDragging: false }),
}))

let db: Db
let app: Rendered | null = null
beforeEach(() => {
  db = createDb()
  installFakeApi(db)
})
afterEach(() => {
  app?.unmount()
  app = null
  notifications.clean()
  document.body.innerHTML = ''
})

const col = (flowId: string, statusId: string) => `${flowId}:${statusId}`
const keysIn = (statusId: string) =>
  [...byTestId(`board-column-${statusId}`)!.querySelectorAll('[data-testid="card-tile"]')].map((t) => t.getAttribute('data-card-key'))
const transitions = () => db.calls.filter((c) => c.path.endsWith('/transition'))
const disabled = (statusId: string, flowId = IDS.flowDev) =>
  document.querySelector(`[data-testid="board-column-${statusId}"][data-flow-id="${flowId}"] [data-droppable-id]`)!.getAttribute('data-disabled') === 'true'

async function openBoard() {
  app = renderApp(`/t/${IDS.team}/projects/${IDS.sprint}/board`, [{ path: '/t/:teamId/projects/:projectId/board', element: <ProjectBoardPage /> }])
  await waitFor(() => allByTestId('card-tile').length === 4, 'four tiles')
}
/** Synchronous on purpose: callers inspect the optimistic UI before the (fake) server has answered. */
const startDrag = (cardId: string, flowId: string, statusId: string, index: number) => {
  act(() => {
    dnd.onDragStart!({ draggableId: cardId, source: { droppableId: col(flowId, statusId), index } })
  })
}
const drop = (cardId: string, from: [string, string, number], to: [string, string, number] | null) => {
  act(() => {
    dnd.onDragEnd!({
      draggableId: cardId,
      source: { droppableId: col(from[0], from[1]), index: from[2] },
      destination: to ? { droppableId: col(to[0], to[1]), index: to[2] } : null,
      reason: 'DROP',
    })
  })
}

describe('board drag and drop', () => {
  it('registers droppables per flow and status with the flow as drag type', async () => {
    await openBoard()
    const ids = [...document.querySelectorAll('[data-droppable-id]')].map((e) => [e.getAttribute('data-droppable-id'), e.getAttribute('data-droppable-type')])
    expect(ids).toContainEqual([col(IDS.flowDev, 'todo'), IDS.flowDev])
    expect(ids).toContainEqual([col(IDS.flowBug, 'fixed'), IDS.flowBug])
    expect(ids).toHaveLength(5)
  })

  it('disables columns the card cannot be dropped in, and dims them', async () => {
    await openBoard()
    startDrag(IDS.c1, IDS.flowDev, 'todo', 0)
    expect(disabled('todo')).toBe(false) // same column: reorder
    expect(disabled('doing')).toBe(false) // todo -> doing is a transition
    expect(disabled('done')).toBe(true) // todo -> done is not
    expect(disabled('open', IDS.flowBug)).toBe(true) // other flow
    const done = document.querySelector<HTMLElement>(`[data-testid="board-column-done"]`)!
    expect(done.style.opacity).toBe('0.4')
    expect(document.querySelector<HTMLElement>(`[data-testid="board-column-doing"]`)!.style.opacity).toBe('1')
    expect(document.querySelector<HTMLElement>(`[data-testid="board-column-open"]`)!.style.opacity).toBe('1') // other sections are not dimmed

    drop(IDS.c1, [IDS.flowDev, 'todo', 0], null) // cancelled
    expect(disabled('done')).toBe(false)
    expect(transitions()).toHaveLength(0)
  })

  it('moves a card to another column: ranks between its new neighbours, optimistic, then persisted', async () => {
    await openBoard()
    startDrag(IDS.c1, IDS.flowDev, 'todo', 0)
    // doing = [ACME-2 (a1)]; dropped at the end -> after a1
    drop(IDS.c1, [IDS.flowDev, 'todo', 0], [IDS.flowDev, 'doing', 1])
    expect(keysIn('doing')).toEqual(['ACME-2', 'ACME-1']) // optimistic, before the server answered
    expect(keysIn('todo')).toEqual(['ACME-4'])
    await waitFor(() => transitions().length === 1, 'transition request')
    expect(transitions()[0]!.body).toEqual({
      expectedStatusId: 'todo', toStatusId: 'doing', projectId: IDS.sprint, rank: rankBetween('a1', null),
    })
    await waitFor(() => db.cards.find((c) => c.id === IDS.c1)!.statusId === 'doing', 'server state')
    expect(keysIn('doing')).toEqual(['ACME-2', 'ACME-1'])
  })

  it('inserts between two cards and at the top', async () => {
    await openBoard()
    // put ACME-4 (sprint rank a2) into doing before ACME-2 (a1): rank above nothing, below a1
    drop(IDS.c4, [IDS.flowDev, 'todo', 1], [IDS.flowDev, 'doing', 0])
    await waitFor(() => transitions().length === 1, 'first request')
    expect((transitions()[0]!.body as { rank: string }).rank).toBe(rankBetween(null, 'a1'))
    await waitFor(() => keysIn('doing').join() === 'ACME-4,ACME-2' && db.cards.find((c) => c.id === IDS.c4)!.statusId === 'doing', 'both in doing')

    // now ACME-1 between ACME-4 and ACME-2
    drop(IDS.c1, [IDS.flowDev, 'todo', 0], [IDS.flowDev, 'doing', 1])
    await waitFor(() => transitions().length === 2, 'second request')
    const ranks = Object.fromEntries(db.cards.map((c) => [c.key, c.ranks[IDS.sprint]]))
    expect(ranks['ACME-1']! > ranks['ACME-4']! && ranks['ACME-1']! < ranks['ACME-2']!).toBe(true)
    await waitFor(() => keysIn('doing').join() === 'ACME-4,ACME-1,ACME-2', 'order after refetch')
  })

  it('reorders inside a column without changing the status', async () => {
    await openBoard()
    drop(IDS.c1, [IDS.flowDev, 'todo', 0], [IDS.flowDev, 'todo', 1])
    expect(keysIn('todo')).toEqual(['ACME-4', 'ACME-1'])
    await waitFor(() => transitions().length === 1, 'request')
    expect(transitions()[0]!.body).toEqual({ expectedStatusId: 'todo', toStatusId: 'todo', projectId: IDS.sprint, rank: rankBetween('a2', null) })
    await waitFor(() => db.cards.find((c) => c.id === IDS.c1)!.ranks[IDS.sprint] === rankBetween('a2', null), 'persisted')
    expect(keysIn('todo')).toEqual(['ACME-4', 'ACME-1'])
  })

  it('does nothing when dropped in place, in a disallowed column, or in another flow', async () => {
    await openBoard()
    drop(IDS.c1, [IDS.flowDev, 'todo', 0], [IDS.flowDev, 'todo', 0])
    drop(IDS.c1, [IDS.flowDev, 'todo', 0], [IDS.flowDev, 'done', 0])
    drop(IDS.c1, [IDS.flowDev, 'todo', 0], [IDS.flowBug, 'open', 0])
    expect(transitions()).toHaveLength(0)
    expect(keysIn('todo')).toEqual(['ACME-1', 'ACME-4'])
    expect(keysIn('done')).toEqual([])
  })

  it('rolls back and refreshes when someone else moved the card (409)', async () => {
    await openBoard()
    db.failNextTransition = { status: 409, message: 'The card was moved by someone else' }
    // the server moved it meanwhile
    db.cards.find((c) => c.id === IDS.c1)!.statusId = 'doing'
    db.cards.find((c) => c.id === IDS.c1)!.statusCategory = 'in_progress'
    drop(IDS.c1, [IDS.flowDev, 'todo', 0], [IDS.flowDev, 'doing', 1])
    expect(keysIn('doing')).toContain('ACME-1') // optimistic
    // fresh server state wins: the card is where the server has it (doing, rank a0 -> first)
    await waitFor(() => keysIn('todo').join() === 'ACME-4', 'todo refreshed')
    expect(keysIn('doing')).toEqual(['ACME-1', 'ACME-2'])
  })

  it('rolls the card back when the move is rejected (422)', async () => {
    await openBoard()
    db.failNextTransition = { status: 422, message: 'Transition not allowed' }
    drop(IDS.c1, [IDS.flowDev, 'todo', 0], [IDS.flowDev, 'doing', 0])
    expect(keysIn('doing')).toEqual(['ACME-1', 'ACME-2'])
    await waitFor(() => keysIn('todo').join() === 'ACME-1,ACME-4' && keysIn('doing').join() === 'ACME-2', 'rolled back')
  })
})
