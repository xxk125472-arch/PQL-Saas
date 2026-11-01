import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from './api'

type State<T> = { data: T | null; error: string | null; loading: boolean }

// Runs `fn` whenever `deps` change; stale responses are dropped.
export function useRequest<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true })
  const seq = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  const reload = useCallback(async () => {
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await run()
      if (id === seq.current) setState({ data, error: null, loading: false })
    } catch (err) {
      if (id === seq.current) setState((s) => ({ ...s, error: errorMessage(err), loading: false }))
    }
  }, [run])

  useEffect(() => {
    void reload()
  }, [reload])

  return { ...state, reload }
}
