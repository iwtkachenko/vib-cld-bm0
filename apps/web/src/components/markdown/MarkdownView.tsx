import { Text, Typography } from '@mantine/core'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const REMARK_PLUGINS = [remarkGfm]

const components: Components = {
  a: ({ node: _node, href, children, ...rest }) => (
    <a {...rest} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  // task-list checkboxes are display-only
  input: ({ node: _node, ...rest }) => <input {...rest} disabled readOnly tabIndex={-1} />,
  ul: ({ node: _node, className, style, ...rest }) => (
    <ul {...rest} className={className} style={className?.includes('contains-task-list') ? { listStyle: 'none', paddingInlineStart: 4, ...style } : style} />
  ),
  img: ({ node: _node, ...rest }) => <img {...rest} loading="lazy" style={{ maxWidth: '100%', height: 'auto' }} />,
  table: ({ node: _node, ...rest }) => (
    <div style={{ overflowX: 'auto' }}>
      <table {...rest} />
    </div>
  ),
}

/** Read-only markdown (GFM). Raw HTML is never rendered (react-markdown's default), unsafe URLs are stripped. */
export function MarkdownView({ value }: { value: string }) {
  if (!value.trim()) return <Text c="dimmed" size="sm" fs="italic" data-testid="md-empty">No description</Text>
  return (
    <Typography data-testid="md-view" style={{ overflowWrap: 'anywhere' }}>
      <Markdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {value}
      </Markdown>
    </Typography>
  )
}
