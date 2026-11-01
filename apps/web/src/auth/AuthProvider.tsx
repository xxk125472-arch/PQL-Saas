import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { ApiError, UNAUTHORIZED_EVENT, request, tokenStore } from '../lib/api'
import type { Me, TokenResponse } from '../lib/types'

type Status = 'loading' | 'authenticated' | 'anonymous'

type AuthCtx = {
  status: Status
  user: Me | null
  login: (identifier: string, password: string) => Promise<void>
  register: (identifier: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [status, setStatus] = useState<Status>(() => (tokenStore.get() ? 'loading' : 'anonymous'))

  const loadMe = useCallback(async () => {
    const me = await request<Me>('/me')
    setUser(me)
    setStatus('authenticated')
  }, [])

  useEffect(() => {
    if (!tokenStore.get()) return
    loadMe().catch((err) => {
      // Keep the token when the server is merely unreachable; only a 401 invalidates it.
      if (err instanceof ApiError && err.status === 401) tokenStore.clear()
      else toast.error(err instanceof ApiError ? err.message : '发生未知错误，请稍后重试')
      setUser(null)
      setStatus('anonymous')
    })
  }, [loadMe])

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null)
      setStatus((prev) => {
        // fixed id: sonner dedupes, so StrictMode's double-invoked updater shows one toast
        if (prev === 'authenticated') toast.error('登录已过期，请重新登录', { id: 'session-expired' })
        return 'anonymous'
      })
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  const authenticate = useCallback(
    async (path: string, identifier: string, password: string) => {
      const res = await request<TokenResponse>(path, {
        method: 'POST',
        auth: false,
        body: { identifier: identifier.trim(), password },
      })
      tokenStore.set(res.access_token)
      try {
        await loadMe()
      } catch (err) {
        tokenStore.clear()
        throw err
      }
    },
    [loadMe],
  )

  const login = useCallback((i: string, p: string) => authenticate('/auth/login', i, p), [authenticate])
  const register = useCallback((i: string, p: string) => authenticate('/auth/register', i, p), [authenticate])

  const logout = useCallback(async () => {
    try {
      await request('/auth/logout', { method: 'POST' })
    } catch {
      // stateless JWT — discarding the token locally is what matters
    }
    tokenStore.clear()
    setUser(null)
    setStatus('anonymous')
  }, [])

  const value = useMemo(() => ({ status, user, login, register, logout }), [status, user, login, register, logout])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
