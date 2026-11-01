import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
type Resolved = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'pql.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // storage unavailable — fall back to system
  }
  return 'system'
}

function resolve(mode: ThemeMode): Resolved {
  if (mode === 'system') return media().matches ? 'dark' : 'light'
  return mode
}

type ThemeCtx = { mode: ThemeMode; resolved: Resolved; setMode: (m: ThemeMode) => void }

const Ctx = createContext<ThemeCtx | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode)
  const [resolved, setResolved] = useState<Resolved>(() => resolve(readMode()))

  useEffect(() => {
    const apply = () => {
      const r = resolve(mode)
      setResolved(r)
      document.documentElement.classList.toggle('dark', r === 'dark')
    }
    apply()
    if (mode !== 'system') return
    const mq = media()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [mode])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, m)
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
