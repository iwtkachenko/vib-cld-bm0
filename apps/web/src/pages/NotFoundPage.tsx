import { Button } from '@mantine/core'
import { IconMapOff } from '@tabler/icons-react'
import { Link } from 'react-router'
import { EmptyState } from '../components/common/EmptyState'

export function NotFoundPage() {
  return <EmptyState icon={<IconMapOff />} title="Page not found" text="The page you are looking for does not exist." action={<Button component={Link} to="/" variant="light">Go home</Button>} />
}
