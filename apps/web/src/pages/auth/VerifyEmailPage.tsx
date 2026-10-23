import { Alert, Button, Loader, Stack } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '../../api/endpoints'
import { qk } from '../../api/queries'
import { AuthLayout } from './AuthLayout'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const qc = useQueryClient()
  const started = useRef(false)
  const verify = useMutation({
    mutationFn: (t: string) => authApi.verifyEmail(t),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
    meta: { silent: true },
  })

  useEffect(() => {
    // The token is single-use: guard against StrictMode's double effect.
    if (token && !started.current) {
      started.current = true
      verify.mutate(token)
    }
  }, [token, verify])

  return (
    <AuthLayout title="Email verification">
      <Stack align="center">
        {!token && <Alert color="red" variant="light">This verification link is incomplete.</Alert>}
        {token && (verify.isPending || verify.isIdle) && <Loader />}
        {verify.isSuccess && <Alert color="green" variant="light" data-testid="verify-success">Your email address is verified. Thank you!</Alert>}
        {verify.isError && <Alert color="red" variant="light">{verify.error.message}</Alert>}
        <Button component={Link} to="/" variant="light">Continue</Button>
      </Stack>
    </AuthLayout>
  )
}
