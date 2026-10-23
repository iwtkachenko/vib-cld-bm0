import { getTaskListExtension, Link } from '@mantine/tiptap'
import { mergeAttributes, Node } from '@tiptap/core'
import type { AnyExtension, Editor, JSONContent, MarkdownParseHelpers, MarkdownToken } from '@tiptap/core'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'

/*
 * Extension list shared by the visual markdown editor AND the round-trip tests (markdown.test.ts),
 * so what is tested is what ships.
 *
 * Known lossy cases when content is re-serialized (only happens after a real edit in Visual mode):
 * - raw HTML is not kept (`<b>x</b>` becomes **x**, unknown tags/blocks are reduced to their text)
 * - footnotes (`[^1]`) are not supported and get garbled; reference-style links are inlined
 * - bare URLs / `<https://…>` autolinks become `[url](url)`
 * - loose lists become tight lists, `*`/`+` bullets become `-`, setext headings become ATX (`#`)
 * - tilde / indented code blocks become fenced code blocks; tables are re-padded
 * - text that starts a paragraph with block syntax written as an escape (`\# not a heading`, `1\. not a list`)
 *   loses its escape (the library only escapes inline syntax)
 * - mixed task/bullet items in one list are split into two lists
 * Markdown mode (the raw textarea) never re-serializes anything.
 */

/** Plain text escaping of the serializer is too eager (`&amp;`, `-&gt;`, `snake\_case`); this is a lighter version. */
const ENTITY_LIKE = /&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g
const WORD_CHAR = /[\p{L}\p{N}]/u

export function escapeMarkdownText(text: string): string {
  let out = text.replace(ENTITY_LIKE, (m) => `&amp;${m.slice(1)}`)
  out = out.replace(/<(?=[A-Za-z/!?])/g, '&lt;')
  if (out.startsWith('>')) out = `&gt;${out.slice(1)}`
  let res = ''
  for (let i = 0; i < out.length; i++) {
    const ch = out[i]!
    if (ch === '\\') {
      const next = out[i + 1]
      res += next === undefined || /[!-/:-@[-`{-~]/.test(next) ? '\\\\' : '\\'
    } else if (ch === '_') {
      const prev = out[i - 1]
      const next = out[i + 1]
      res += prev && next && WORD_CHAR.test(prev) && WORD_CHAR.test(next) ? '_' : '\\_'
    } else if (ch === '*') {
      const prev = out[i - 1]
      const next = out[i + 1]
      res += prev && next && /\s/.test(prev) && /\s/.test(next) ? '*' : '\\*'
    } else if (ch === '`' || ch === '[' || ch === ']' || ch === '~') {
      res += `\\${ch}`
    } else res += ch
  }
  return res
}

type PatchableManager = {
  codeTypes?: Set<string>
  encodeTextForMarkdown?: (text: string, node: JSONContent, parent?: JSONContent) => string
}

/** `@tiptap/markdown` with a lighter text escaper (patched on the manager instance; falls back to the stock one). */
const MarkdownLite = Markdown.extend({
  onBeforeCreate(event) {
    this.parent?.(event)
    const manager = (this.storage as unknown as { manager?: PatchableManager }).manager
    if (!manager?.encodeTextForMarkdown || !(manager.codeTypes instanceof Set)) return
    const codeTypes = manager.codeTypes
    const original = manager.encodeTextForMarkdown.bind(manager)
    manager.encodeTextForMarkdown = (text, node, parent) => {
      const inCode =
        (parent?.type != null && codeTypes.has(parent.type)) ||
        (node.marks ?? []).some((m) => codeTypes.has(typeof m === 'string' ? m : m.type))
      return inCode ? original(text, node, parent) : escapeMarkdownText(text)
    }
  },
})

/** Inline `![alt](src "title")` image so images survive an edit in Visual mode (StarterKit has none). */
const MarkdownImage = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null }, alt: { default: null }, title: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'img[src]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes({ style: 'max-width: 100%' }, HTMLAttributes)]
  },
  markdownTokenName: 'image',
  parseMarkdown: (token, helpers) =>
    helpers.createNode('image', { src: token.href, alt: token.text || null, title: token.title || null }),
  renderMarkdown: (node) => {
    const { src, alt, title } = (node.attrs ?? {}) as { src?: string; alt?: string; title?: string }
    const t = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
    return `![${(alt ?? '').replace(/[[\]]/g, '\\$&')}](${src ?? ''}${t})`
  },
})

/** StarterKit whose fenced code blocks use a fence longer than any backtick run inside the code. */
const Kit = StarterKit.extend({
  addExtensions() {
    const list = (this.parent?.() ?? []) as AnyExtension[]
    return list.map((ext) =>
      ext.name === 'orderedList'
        ? // The library's own ordered-list tokenizer mis-indents code/lists nested in items ("1. x" has a 3-wide marker).
          // Use marked's built-in list tokenizer and parse items like bullet lists do (alphabetic/roman markers are lost).
          ext.extend({
            markdownTokenizer: null as unknown as undefined,
            parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers) => {
              if (token.type !== 'list' || !token.ordered) return []
              const start = typeof token.start === 'number' ? token.start : 1
              return {
                type: 'orderedList',
                ...(start !== 1 ? { attrs: { start } } : {}),
                content: token.items ? helpers.parseChildren(token.items) : [],
              }
            },
          })
        : ext.name === 'codeBlock'
        ? ext.extend({
            renderMarkdown(node, h) {
              const language = (node.attrs?.language as string | null | undefined) ?? ''
              const code = node.content ? h.renderChildren(node.content) : ''
              const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((r) => r.length))
              const fence = '`'.repeat(Math.max(3, longest + 1))
              return `${fence}${language}\n${code}${code ? '\n' : '\n'}${fence}`
            },
          })
        : ext,
    )
  },
})

export function createMarkdownExtensions(): AnyExtension[] {
  return [
    Kit.configure({
      link: false, // replaced by Mantine's Link (StarterKit bundles one)
      underline: false, // no markdown syntax for underline
      trailingNode: false, // would serialize as a stray `&nbsp;` paragraph
      heading: { levels: [1, 2, 3, 4] },
    }),
    Link,
    MarkdownImage,
    getTaskListExtension(TaskList), // adds Mantine's task-list classes (checkbox layout)
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    MarkdownLite.configure({ markedOptions: { gfm: true } }),
  ]
}

/** Serialize without the leading/trailing blank lines some nodes (tables) produce. */
export function getMarkdown(editor: Editor): string {
  return editor.getMarkdown().replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '')
}
