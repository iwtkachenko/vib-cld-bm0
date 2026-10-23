import { Button, Tooltip } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'

/** "New card" button of the board and list toolbars; disabled (with an explanation) for archived projects. */
export function NewCardButton({ archived, onClick }: { archived: boolean; onClick: () => void }) {
  return (
    <Tooltip label="Archived projects do not accept new cards" disabled={!archived} withArrow>
      {/* a disabled button swallows pointer events, so the tooltip hangs off a wrapper */}
      <span>
        <Button leftSection={<IconPlus size={16} />} data-testid="new-card" disabled={archived} onClick={onClick}>
          New card
        </Button>
      </span>
    </Tooltip>
  )
}
