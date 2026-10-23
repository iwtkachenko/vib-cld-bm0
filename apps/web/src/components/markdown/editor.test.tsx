import { MantineProvider } from '@mantine/core'
import { act, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MarkdownEditor from './MarkdownEditor'
import { MarkdownView } from './MarkdownView'

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
})

function mount(node: React.ReactNode) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(<StrictMode><MantineProvider>{node}</MantineProvider></StrictMode>))
  return host
}
const q = (testId: string) => document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
const click = (el: Element | null) => act(() => { (el as HTMLElement).click() })
const proseText = () => document.querySelector('.ProseMirror')?.textContent ?? ''

/** Parent that owns the markdown string like the card modal does. */
function Harness({ initial, onChange, setExternal }: { initial: string; onChange: (md: string) => void; setExternal?: { current: ((md: string) => void) | null } }) {
  const [value, setValue] = useState(initial)
  if (setExternal) setExternal.current = setValue
  return <MarkdownEditor value={value} onChange={(md) => { setValue(md); onChange(md) }} />
}

describe('MarkdownEditor', () => {
  it('never emits (or rewrites the value) when merely opened, switched to Markdown and back', () => {
    const onChange = vi.fn()
    const original = '* a\n* b\n\nSee <https://example.com> & "stuff"'
    mount(<Harness initial={original} onChange={onChange} />)
    expect(proseText()).toContain('a')
    click(q('md-mode-markdown'))
    expect((q('md-source') as HTMLTextAreaElement).value).toBe(original)
    click(q('md-mode-visual'))
    click(q('md-mode-markdown'))
    expect((q('md-source') as HTMLTextAreaElement).value).toBe(original)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('edits in Markdown mode go straight to onChange and show up in Visual mode', () => {
    const onChange = vi.fn()
    mount(<Harness initial="start" onChange={onChange} />)
    click(q('md-mode-markdown'))
    const area = q('md-source') as HTMLTextAreaElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(area, '# Heading\n\n- [ ] task')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith('# Heading\n\n- [ ] task')
    onChange.mockClear()
    click(q('md-mode-visual'))
    expect(proseText()).toContain('Heading')
    expect(proseText()).toContain('task')
    expect(document.querySelector('.ProseMirror h1')).not.toBeNull()
    expect(document.querySelector('.ProseMirror input[type="checkbox"]')).not.toBeNull()
    expect(onChange).not.toHaveBeenCalled() // loading markdown into the editor is silent
  })

  it('syncs an external value change into the editor without emitting', () => {
    const onChange = vi.fn()
    const setExternal: { current: ((md: string) => void) | null } = { current: null }
    mount(<Harness initial="first text" onChange={onChange} setExternal={setExternal} />)
    expect(proseText()).toBe('first text')
    act(() => setExternal.current!('second text\n\n- x'))
    expect(proseText()).toContain('second text')
    expect(proseText()).not.toContain('first text')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('emits normalized markdown after a real visual edit and does not loop', () => {
    const onChange = vi.fn()
    mount(<Harness initial={'text\n\n* a'} onChange={onChange} />)
    const hr = [...document.querySelectorAll<HTMLElement>('button')].find((b) => /horizontal|divider|line/i.test(b.getAttribute('aria-label') ?? ''))
    expect(hr).toBeTruthy()
    click(hr!)
    expect(onChange).toHaveBeenCalledTimes(1)
    const md = onChange.mock.calls[0]![0] as string
    expect(md).toContain('---')
    expect(md).toContain('- a')
    expect(proseText()).toContain('text')
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('MarkdownView', () => {
  it('shows a dimmed placeholder for empty content', () => {
    mount(<MarkdownView value="  " />)
    expect(q('md-empty')?.textContent).toBe('No description')
  })

  it('renders GFM, opens links in a new tab, keeps checkboxes read-only and never renders raw HTML', () => {
    mount(<MarkdownView value={'# T\n\n[x](https://example.com) <script>alert(1)</script> <b>raw</b>\n\n- [x] done\n- [ ] open\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n[bad](javascript:alert(1))'} />)
    const view = q('md-view')!
    expect(view.querySelector('h1')?.textContent).toBe('T')
    const link = view.querySelector<HTMLAnchorElement>('a[href="https://example.com"]')!
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
    const boxes = [...view.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(boxes.map((b) => b.checked)).toEqual([true, false])
    expect(boxes.every((b) => b.disabled)).toBe(true)
    expect(view.querySelector('table')).not.toBeNull()
    expect(view.querySelector('script')).toBeNull()
    expect(view.querySelector('b')).toBeNull()
    expect([...view.querySelectorAll('a')].some((a) => (a.getAttribute('href') ?? '').startsWith('javascript'))).toBe(false)
  })
})
