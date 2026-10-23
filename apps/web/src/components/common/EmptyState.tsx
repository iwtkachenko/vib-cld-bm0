import { Center, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import type { ReactNode } from 'react'

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs" maw={420} ta="center">
        {icon && <ThemeIcon size={48} radius="xl" variant="light">{icon}</ThemeIcon>}
        <Title order={4}>{title}</Title>
        {text && <Text c="dimmed" size="sm">{text}</Text>}
        {action}
      </Stack>
    </Center>
  )
}
