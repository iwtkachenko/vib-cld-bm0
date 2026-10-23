import { Alert, Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconMailExclamation } from '@tabler/icons-react'
import { useMe, useResendVerification } from '../api/queries'

export function VerifyBanner() {
  const me = useMe().data
  const resend = useResendVerification()
  if (!me || me.user.emailVerified) return null
  return (
    <Alert color="yellow" icon={<IconMailExclamation size={18} />} mb="md" title="Verify your email address">
      We sent a link to <b>{me.user.email}</b>. Verifying lets you see and accept team invitations.{' '}
      <Button
        size="compact-sm" variant="light" color="yellow" loading={resend.isPending}
        onClick={() => resend.mutate(undefined, { onSuccess: () => notifications.show({ message: 'Verification email sent' }) })}
      >
        Resend email
      </Button>
    </Alert>
  )
}
