import { Button, Checkbox, Stack, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useNavigate } from 'react-router'
import { deriveTeamKey } from '@pm/shared'
import { useCreateTeam } from '../../api/queries'

export function CreateTeamForm({ onDone }: { onDone?: () => void }) {
  const navigate = useNavigate()
  const create = useCreateTeam()
  const form = useForm({
    mode: 'controlled',
    initialValues: { name: '', key: '', starterKit: false },
    validate: {
      name: (v) => (v.trim() ? null : 'Name is required'),
      key: (v) => (!v.trim() || /^[A-Za-z][A-Za-z0-9]{1,9}$/.test(v.trim()) ? null : 'Key: 2–10 letters/digits, starting with a letter'),
    },
  })
  const keyPlaceholder = form.values.name.trim() ? deriveTeamKey(form.values.name) : 'e.g. ACME'

  return (
    <form
      onSubmit={form.onSubmit(async (v) => {
        const r = await create.mutateAsync({ name: v.name, key: v.key.trim() || undefined, starterKit: v.starterKit })
        onDone?.()
        navigate(`/t/${r.team.id}/projects`)
      })}
    >
      <Stack>
        <TextInput label="Team name" placeholder="Acme Inc." data-autofocus {...form.getInputProps('name')} />
        <TextInput
          label="Key"
          description="Prefix of card keys, e.g. ACME-12. Derived from the name when empty."
          placeholder={keyPlaceholder}
          {...form.getInputProps('key')}
        />
        <Checkbox
          label="Add starter kit"
          description="Task/Bug/Story types, two flows, a Sprint template and a Backlog project."
          {...form.getInputProps('starterKit', { type: 'checkbox' })}
        />
        <Button type="submit" loading={create.isPending}>Create team</Button>
      </Stack>
    </form>
  )
}
