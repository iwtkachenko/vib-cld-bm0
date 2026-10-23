import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core'
import { schemaResolver, useForm } from '@mantine/form'
import { Link, useLocation, useNavigate } from 'react-router'
import { loginInput } from '@pm/shared'
import { useLogin } from '../../api/queries'
import { AuthLayout } from './AuthLayout'

export function LoginPage() {
  const login = useLogin()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const form = useForm({ initialValues: { email: '', password: '' }, validate: schemaResolver(loginInput, { sync: true }) })
  return (
    <AuthLayout title="Sign in" subtitle="Welcome back">
      <form onSubmit={form.onSubmit((v) => login.mutate(v, { onSuccess: () => navigate(from, { replace: true }) }))}>
        <Stack>
          {login.error && <Alert color="red" variant="light">{login.error.message}</Alert>}
          <TextInput label="Email" type="email" autoComplete="email" data-autofocus {...form.getInputProps('email')} />
          <PasswordInput label="Password" autoComplete="current-password" {...form.getInputProps('password')} />
          <Button type="submit" loading={login.isPending}>Sign in</Button>
          <Text size="sm" ta="center">
            No account? <Anchor component={Link} to="/register">Create one</Anchor>
          </Text>
        </Stack>
      </form>
    </AuthLayout>
  )
}
