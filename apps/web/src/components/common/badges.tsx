import { Avatar, Badge, Group, Tooltip } from '@mantine/core'
import type { CardTypeDto, MemberDto, StatusDef } from '@pm/shared'
import { STATUS_CATEGORY_COLOR } from '../../utils/colors'

export function TypeBadge({ type, size = 'sm' }: { type: Pick<CardTypeDto, 'name' | 'icon' | 'color'> | undefined; size?: 'xs' | 'sm' | 'md' }) {
  if (!type) return <Badge color="gray" variant="light" size={size}>Unknown type</Badge>
  return (
    <Badge color={type.color} variant="light" size={size} leftSection={<span>{type.icon}</span>} style={{ textTransform: 'none' }}>
      {type.name}
    </Badge>
  )
}

export function StatusBadge({ status, size = 'sm' }: { status: Pick<StatusDef, 'name' | 'color' | 'category'> | undefined; size?: 'xs' | 'sm' | 'md' }) {
  if (!status) return <Badge color="gray" variant="light" size={size}>?</Badge>
  return (
    <Badge color={status.color || STATUS_CATEGORY_COLOR[status.category]} variant="light" size={size} style={{ textTransform: 'none' }}>
      {status.name}
    </Badge>
  )
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')

export function UserAvatar({ member, size = 24 }: { member: Pick<MemberDto, 'name' | 'email'> | undefined; size?: number }) {
  return (
    <Tooltip label={member ? `${member.name} (${member.email})` : 'Former member'} withArrow>
      <Avatar size={size} radius="xl" color="initials" name={member?.name ?? '?'}>
        {member ? initials(member.name) : '?'}
      </Avatar>
    </Tooltip>
  )
}

export function AssigneeAvatars({ ids, members, size = 24, max = 3 }: { ids: string[]; members: Map<string, MemberDto>; size?: number; max?: number }) {
  if (ids.length === 0) return null
  return (
    <Avatar.Group>
      {ids.slice(0, max).map((id) => (
        <UserAvatar key={id} member={members.get(id)} size={size} />
      ))}
      {ids.length > max && <Avatar size={size} radius="xl">+{ids.length - max}</Avatar>}
    </Avatar.Group>
  )
}

export function Row({ children }: { children: React.ReactNode }) {
  return <Group gap="xs" wrap="nowrap">{children}</Group>
}
