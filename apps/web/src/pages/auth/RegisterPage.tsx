import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core'
import { schemaResolver, useForm } from '@mantine/form'
import { Link, useNavigate } from 'react-router'
import { registerInput } from '@pm/shared'
import { useRegister } from '../../api/queries'
import { AuthLayout } from './AuthLayout'

export function RegisterPage() {
  const register = useRegister()
  const navigate = useNavigate()
  const form = useForm({ initialValues: { name: '', email: '', password: '' }, validate: schemaResolver(registerInput, { sync: true }) })
  return (
    <AuthLayout title="Create your account" subtitle="Plan projects with your team">
      <form onSubmit={form.onSubmit((v) => register.mutate(v, { onSuccess: () => navigate('/', { replace: true }) }))}>
        <Stack>
          {register.error && <Alert color="red" variant="light">{register.error.message}</Alert>}
          <TextInput label="Name" autoComplete="name" data-autofocus {...form.getInputProps('name')} />
          <TextInput label="Email" type="email" autoComplete="email" {...form.getInputProps('email')} />
          <PasswordInput label="Password" description="At least 8 characters" autoComplete="new-password" {...form.getInputProps('password')} />
          <Button type="submit" loading={register.isPending}>Create account</Button>
          <Text size="sm" ta="center">
            Already registered? <Anchor component={Link} to="/login">Sign in</Anchor>
          </Text>
        </Stack>
      </form>
    </AuthLayout>
  )
}
