import { Box, Center, SegmentedControl, Stack, Textarea } from '@mantine/core'
import { RichTextEditor } from '@mantine/tiptap'
import { IconEye, IconMarkdown } from '@tabler/icons-react'
import Placeholder from '@tiptap/extension-placeholder'
import { useEditor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { createMarkdownExtensions, getMarkdown } from './extensions'

/** Default export so it can be React.lazy-loaded. */
export interface MarkdownEditorProps {
  /** Markdown source. */
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  minHeight?: number
}

type Mode = 'visual' | 'markdown'

/**
 * WYSIWYG (TipTap) + raw markdown editor. The markdown string (`value`) is the single source of truth:
 * - Markdown mode edits it directly (nothing is ever re-serialized).
 * - Visual mode emits `editor.getMarkdown()` only after a real edit; opening/closing the editor, or switching
 *   modes without typing, never rewrites the stored markdown.
 * - External `value` changes are loaded into the editor (without emitting) when Visual mode is shown.
 */
export default function MarkdownEditor({ value, onChange, placeholder = 'Write something…', minHeight = 160 }: MarkdownEditorProps) {
  const [mode, setMode] = useState<Mode>('visual')
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  /** The markdown the editor document currently stands for: what it was loaded with, or what it last emitted. */
  const known = useRef(value)
  const [extensions] = useState(() => [...createMarkdownExtensions(), Placeholder.configure({ placeholder })])

  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { style: `min-height: ${minHeight}px`, 'aria-label': 'Rich text editor' } },
    onUpdate: ({ editor: ed }) => {
      const md = getMarkdown(ed)
      if (md === known.current) return
      known.current = md
      onChangeRef.current(md)
    },
  })

  // Parent changed the value (reset, other card, typed in Markdown mode): load it into the editor, silently.
  useEffect(() => {
    if (!editor || editor.isDestroyed || mode !== 'visual' || value === known.current) return
    known.current = value
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
  }, [editor, mode, value])

  const inTable = !!editor?.isActive('table')

  return (
    <Stack gap="xs">
      <SegmentedControl
        size="xs"
        w="fit-content"
        value={mode}
        onChange={(v) => setMode(v as Mode)}
        aria-label="Editor mode"
        data={[
          { value: 'visual', label: <Center data-testid="md-mode-visual" style={{ gap: 6 }}><IconEye size={14} /><span>Visual</span></Center> },
          { value: 'markdown', label: <Center data-testid="md-mode-markdown" style={{ gap: 6 }}><IconMarkdown size={14} /><span>Markdown</span></Center> },
        ]}
      />
      <Box display={mode === 'visual' ? 'block' : 'none'}>
        <RichTextEditor editor={editor} data-testid="md-visual">
          <RichTextEditor.Toolbar sticky stickyOffset={0}>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Bold />
              <RichTextEditor.Italic />
              <RichTextEditor.Strikethrough />
              <RichTextEditor.Code />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.H2 />
              <RichTextEditor.H3 />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.BulletList />
              <RichTextEditor.OrderedList />
              <RichTextEditor.TaskList />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Blockquote />
              <RichTextEditor.CodeBlock />
              <RichTextEditor.Hr />
              <RichTextEditor.TableInsert />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Link />
              <RichTextEditor.Unlink />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Undo />
              <RichTextEditor.Redo />
            </RichTextEditor.ControlsGroup>
            {inTable && (
              <RichTextEditor.ControlsGroup>
                <RichTextEditor.TableRowAfter />
                <RichTextEditor.TableColumnAfter />
                <RichTextEditor.TableRowDelete />
                <RichTextEditor.TableColumnDelete />
                <RichTextEditor.TableDelete />
              </RichTextEditor.ControlsGroup>
            )}
          </RichTextEditor.Toolbar>
          <RichTextEditor.Content />
        </RichTextEditor>
      </Box>
      {mode === 'markdown' && (
        <Textarea
          data-testid="md-source"
          aria-label="Markdown source"
          autosize
          minRows={Math.max(4, Math.round(minHeight / 24))}
          maxRows={32}
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => onChange(e.currentTarget.value)}
          styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-sm)' } }}
        />
      )}
    </Stack>
  )
}
