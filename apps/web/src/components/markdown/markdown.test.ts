import { Editor, type JSONContent } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createMarkdownExtensions, escapeMarkdownText, getMarkdown } from './extensions'

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

function load(md: string): Editor {
  const editor = new Editor({ extensions: createMarkdownExtensions(), content: md, contentType: 'markdown' })
  editors.push(editor)
  return editor
}
const roundTrip = (md: string) => getMarkdown(load(md))

/** Whitespace-insensitive comparison: trailing spaces, blank-line runs and table padding do not matter. */
function normalize(md: string): string {
  return md
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      if (!/^\s*\|.*\|\s*$/.test(line)) return line.replace(/[ \t]+$/, '')
      return line
        .trim()
        .split('|')
        .slice(1, -1)
        .map((cell) => {
          const c = cell.trim()
          return /^:?-+:?$/.test(c) ? `${c.startsWith(':') ? ':' : ''}---${c.endsWith(':') ? ':' : ''}` : c
        })
        .join(' | ')
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Samples that must come back as equivalent markdown. */
const SAMPLES: Record<string, string> = {
  headings: '# Title\n\n## Section\n\n### Sub section\n\n#### Level four\n\nBody text',
  'bold / italic / strike / code': 'Some **bold**, *italic*, ~~strike~~ and `code` text',
  'nested emphasis': '***both*** and **bold *nested italic*** and `code with **stars**`',
  'bullet list': '- one\n- two\n- three',
  'nested bullet list': '- a\n  - b\n    - c\n- d',
  'ordered list': '1. one\n2. two\n3. three',
  'nested ordered list': '1. one\n2. two\n   1. nested a\n   2. nested b\n3. three',
  'ordered list with a start number': '3. three\n4. four',
  'bullets nested in ordered': '1. one\n   - x\n   - y\n2. two',
  'inline formatting in ordered items': '1. Freeze `main`\n2. **bold** and *em* and [link](https://e.com)\n3. last `x` item',
  'ordered list nested in bullets': '- a\n  1. x\n  2. y\n- b',
  'code block nested in ordered item': '1. one\n2. run it:\n   ```sh\n   npm run build\n   ```\n3. three',
  'task list nested in ordered item': '1. one\n   - [x] login\n   - [ ] checkout\n2. two',
  'two-digit ordered items with children': '9. nine\n10. ten\n    - sub\n11. eleven',
  'task list': '- [ ] todo\n- [x] done',
  'nested task list': '- [ ] a\n  - [x] b\n    - [ ] c',
  'fenced code with language': '```ts\nconst a = 1\n\nconst b = 2\n```',
  'fenced code without language': '```\nplain text\n```',
  'code containing a fence': '````md\n```js\nx()\n```\n````',
  table: '| Name | Qty |\n| --- | --- |\n| Apple | 1 |\n| Pear | 22 |',
  'table with alignment': '| A | B | C |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |',
  'table with escaped pipe': '| A | B |\n| --- | --- |\n| x \\| y | `a\\|b` |',
  link: 'See [the docs](https://example.com/docs) now',
  'link with title': '[x](https://example.com "A title")',
  'formatted link': '[**bold link**](https://example.com) and [*italic link*](https://example.com/b)',
  image: 'An image: ![alt text](https://example.com/a.png "Title")',
  blockquote: '> quoted line\n> second line\n\nafter',
  'nested blockquote': '> a\n>\n> > b',
  'list inside blockquote': '> - a\n> - b',
  'horizontal rule': 'above\n\n---\n\nbelow',
  'paragraphs and hard break': 'one\n\ntwo  \nsame paragraph\n\nthree',
  'list item with two paragraphs': '- a\n\n  more about a\n- b',
  'code block inside list': '- item\n  ```js\n  x()\n  ```',
  'special characters stay plain': 'R&D, Q&A, a -> b, 1 < 2 > 0, snake_case_name, 2 * 3 * 4, "quotes" and \'single\'',
  'escaped markdown characters': 'literal \\*stars\\* and \\_under\\_ and \\`ticks\\` and \\[brackets\\]',
  'literal entity text': 'write &amp;amp; to get an ampersand entity',
  unicode: 'Unicode ✓ café 日本語 😀',
  empty: '',
}

describe('markdown round trip (same extensions as the editor)', () => {
  for (const [name, md] of Object.entries(SAMPLES)) {
    it(`keeps: ${name}`, () => {
      const out = roundTrip(md)
      expect(normalize(out)).toBe(normalize(md))
      // serializing the result again must not change anything (stable)
      expect(roundTrip(out)).toBe(out)
    })
  }

  it('round-trips a realistic document', () => {
    const doc = [
      '# Release checklist',
      '',
      'Ship **v2** to production. See the [runbook](https://example.com/runbook).',
      '',
      '## Steps',
      '',
      '1. Freeze `main`',
      '2. Run the migration:',
      '   ```sh',
      '   npm run migrate -- --dry-run',
      '   ```',
      '3. Smoke test',
      '   - [x] login',
      '   - [ ] checkout',
      '',
      '> Rollback if error rate > 2%.',
      '',
      '| Env | Owner |',
      '| --- | --- |',
      '| staging | Ann |',
      '| prod | Bob |',
      '',
      '---',
      '',
      'Done.',
    ].join('\n')
    expect(normalize(roundTrip(doc))).toBe(normalize(doc))
  })

  it('parses task lists into task items with their checked state', () => {
    const json = load('- [ ] a\n- [x] b').getJSON()
    const items = (json.content?.[0]?.content ?? []) as JSONContent[]
    expect(json.content?.[0]?.type).toBe('taskList')
    expect(items.map((i) => i.attrs?.checked)).toEqual([false, true])
  })

  it('parses fenced code into a codeBlock with its language', () => {
    const node = load('```ts\nx\n```').getJSON().content?.[0] as JSONContent | undefined
    expect(node?.type).toBe('codeBlock')
    expect(node?.attrs?.language).toBe('ts')
  })

  it('does not append an empty trailing paragraph (no stray &nbsp;)', () => {
    expect(roundTrip('only a paragraph')).toBe('only a paragraph')
    expect(roundTrip('- a\n- b')).not.toContain('&nbsp;')
  })

  it('trims the blank lines that tables serialize with', () => {
    const out = roundTrip('| A | B |\n| --- | --- |\n| 1 | 2 |')
    expect(out.startsWith('|')).toBe(true)
    expect(out.endsWith('|')).toBe(true)
  })
})

/**
 * KNOWN LOSSY / NORMALIZING CASES. These only apply once someone edits in Visual mode (the whole document is
 * re-serialized then); Markdown mode and untouched content are never rewritten. Documented here so a change in
 * the library's behavior shows up as a failing test.
 */
describe('known normalizations (documented, not bugs in our code)', () => {
  it('normalizes bullet markers, loose lists, setext headings and tilde fences', () => {
    expect(roundTrip('* a\n* b')).toBe('- a\n- b')
    expect(roundTrip('- a\n\n- b')).toBe('- a\n- b')
    expect(roundTrip('Title\n=====\n\nSub\n---')).toBe('# Title\n\n## Sub')
    expect(roundTrip('~~~py\nprint(1)\n~~~')).toBe('```py\nprint(1)\n```')
    expect(roundTrip('***\n\nx\n\n___')).toBe('---\n\nx\n\n---')
  })

  it('re-pads tables (alignment markers are kept, padding is not)', () => {
    const out = roundTrip('| A | B |\n|:--|--:|\n| 1 | 2 |')
    expect(out).toContain('| A ')
    expect(out).toMatch(/:-+ \|/)
    expect(out).toMatch(/-+: \|/)
  })

  it('turns autolinks and bare URLs into explicit links, and reference links into inline links', () => {
    expect(roundTrip('<https://a.com>')).toBe('[https://a.com](https://a.com)')
    expect(roundTrip('[ref][1]\n\n[1]: https://e.com')).toBe('[ref](https://e.com)')
  })

  it('does not keep raw HTML (tags are interpreted or reduced to their text)', () => {
    expect(roundTrip('a <b>bold</b> b')).toBe('a **bold** b')
    expect(roundTrip('<div>block</div>')).toBe('block')
  })

  it('drops the escape of block syntax at the start of a paragraph', () => {
    // the library escapes inline syntax only; `\# x` comes back as `# x` (and would then parse as a heading)
    expect(roundTrip('\\# not a heading')).toBe('# not a heading')
  })

  it('does not understand footnotes (they get garbled when edited visually)', () => {
    expect(roundTrip('text[^1]\n\n[^1]: note')).not.toBe('text[^1]\n\n[^1]: note')
  })
})

describe('escapeMarkdownText', () => {
  it('leaves ordinary punctuation alone', () => {
    expect(escapeMarkdownText('R&D -> a < b > c & d')).toBe('R&D -> a < b > c & d')
    expect(escapeMarkdownText('snake_case_name')).toBe('snake_case_name')
    expect(escapeMarkdownText('C:\\dir\\file')).toBe('C:\\dir\\file')
    expect(escapeMarkdownText('2 * 3')).toBe('2 * 3')
  })

  it('escapes what would otherwise change the meaning', () => {
    expect(escapeMarkdownText('*a* _b_ `c` [d] ~e~')).toBe('\\*a\\* \\_b\\_ \\`c\\` \\[d\\] \\~e\\~')
    expect(escapeMarkdownText('&amp; &#38; <b>')).toBe('&amp;amp; &amp;#38; &lt;b>')
    expect(escapeMarkdownText('a\\*')).toBe('a\\\\\\*')
    expect(escapeMarkdownText('> quote')).toBe('&gt; quote')
  })
})
