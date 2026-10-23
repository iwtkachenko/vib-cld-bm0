import { Skeleton } from '@mantine/core'
import { lazy, Suspense } from 'react'
import type { MarkdownEditorProps } from '../markdown/MarkdownEditor'

// TipTap is heavy: keep it (and ProseMirror) out of the main bundle until someone edits a description.
const MarkdownEditor = lazy(() => import('../markdown/MarkdownEditor'))

export function LazyMarkdownEditor(props: MarkdownEditorProps) {
  return (
    <Suspense fallback={<Skeleton h={(props.minHeight ?? 160) + 80} radius="md" />}>
      <MarkdownEditor {...props} />
    </Suspense>
  )
}
