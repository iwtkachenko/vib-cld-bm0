import { Center, Paper, Stack, Text, Title } from '@mantine/core'
import { IconStack2 } from '@tabler/icons-react'
import type { ReactNode } from 'react'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <Center mih="100vh" p="md">
      <Stack w={400} maw="100%" gap="md">
        <Stack align="center" gap={4}>
          <IconStack2 size={36} />
          <Title order={2}>{title}</Title>
          {subtitle && <Text c="dimmed" size="sm" ta="center">{subtitle}</Text>}
        </Stack>
        <Paper withBorder shadow="sm" p="lg" radius="md">{children}</Paper>
      </Stack>
    </Center>
  )
}
