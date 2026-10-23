import { ActionIcon, AppShell, Avatar, Burger, Group, Indicator, Menu, NavLink, Text, useMantineColorScheme, useComputedColorScheme } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconBell, IconCards, IconLayoutKanban, IconLogout, IconMoon, IconRoute, IconSettings, IconStack2, IconSun, IconTemplate,
} from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useLogout, useMe } from '../api/queries'
import { TeamSwitcher } from './TeamSwitcher'
import { VerifyBanner } from './VerifyBanner'

const NAV = [
  { to: 'projects', label: 'Projects', icon: IconLayoutKanban },
  { to: 'templates', label: 'Templates', icon: IconTemplate },
  { to: 'card-types', label: 'Card types', icon: IconCards },
  { to: 'flows', label: 'Flows', icon: IconRoute },
  { to: 'settings', label: 'Team', icon: IconSettings },
] as const

function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme()
  const computed = useComputedColorScheme('light')
  return (
    <ActionIcon variant="subtle" color="gray" aria-label="Toggle color scheme" onClick={() => setColorScheme(computed === 'dark' ? 'light' : 'dark')}>
      {computed === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
    </ActionIcon>
  )
}

function UserMenu() {
  const me = useMe().data
  const logout = useLogout()
  const navigate = useNavigate()
  if (!me) return null
  return (
    <Menu position="bottom-end" width={220} withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" radius="xl" size="lg" aria-label="User menu" data-testid="user-menu">
          <Avatar size={28} radius="xl" color="initials" name={me.user.name} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          <Text size="sm" fw={600} c="var(--mantine-color-text)">{me.user.name}</Text>
          <Text size="xs">{me.user.email}</Text>
        </Menu.Label>
        <Menu.Item leftSection={<IconLogout size={14} />} onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}>
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

export function AppLayout({ teamId, children }: { teamId?: string; children: ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure()
  const me = useMe().data
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <AppShell
      header={{ height: 56 }}
      navbar={teamId ? { width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } } : undefined}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            {teamId && <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />}
            <Link to="/" className="pm-link" aria-label="Home">
              <Group gap={6} wrap="nowrap">
                <IconStack2 size={22} />
                <Text fw={700} visibleFrom="xs">Projects</Text>
              </Group>
            </Link>
            <TeamSwitcher currentTeamId={teamId} />
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Indicator label={me?.pendingInvitations} disabled={!me?.pendingInvitations} size={16} color="red" offset={4}>
              <ActionIcon variant="subtle" color="gray" aria-label="Invitations" onClick={() => navigate('/invitations')}>
                <IconBell size={18} />
              </ActionIcon>
            </Indicator>
            <ColorSchemeToggle />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>
      {teamId && (
        <AppShell.Navbar p="xs">
          {NAV.map(({ to, label, icon: Icon }) => {
            const href = `/t/${teamId}/${to}`
            return (
              <NavLink
                key={to} component={Link} to={href} label={label} leftSection={<Icon size={18} />}
                active={location.pathname.startsWith(href)} onClick={close} style={{ borderRadius: 8 }}
              />
            )
          })}
        </AppShell.Navbar>
      )}
      <AppShell.Main>
        <VerifyBanner />
        {children}
      </AppShell.Main>
    </AppShell>
  )
}
