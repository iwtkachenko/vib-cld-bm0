import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** The card modal is driven by `?card=<id>` so it works on every team route and is linkable. */
export function useCardModal() {
  const [params, setParams] = useSearchParams()
  const cardId = params.get('card')
  const open = useCallback(
    (id: string) =>
      setParams((p) => {
        const next = new URLSearchParams(p)
        next.set('card', id)
        return next
      }),
    [setParams],
  )
  const close = useCallback(
    () =>
      setParams((p) => {
        const next = new URLSearchParams(p)
        next.delete('card')
        return next
      }),
    [setParams],
  )
  return { cardId, open, close }
}
