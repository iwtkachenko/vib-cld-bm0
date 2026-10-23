import { Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import type { ReactNode } from 'react'

/** Open a confirmation dialog; `onConfirm` runs when the user agrees. */
export function confirmAction(opts: { title: string; message: ReactNode; confirmLabel?: string; color?: string; onConfirm: () => void }) {
  modals.openConfirmModal({
    title: opts.title,
    centered: true,
    children: <Text size="sm">{opts.message}</Text>,
    labels: { confirm: opts.confirmLabel ?? 'Confirm', cancel: 'Cancel' },
    confirmProps: { color: opts.color ?? 'red' },
    onConfirm: opts.onConfirm,
  })
}
