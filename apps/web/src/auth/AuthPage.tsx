import { useEffect, useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Logo } from '@/components/Logo'
import { ThemeMenu } from '@/components/ThemeMenu'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { PASSWORD_MIN_LENGTH, errorMessage } from '@/lib/api'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useAuth } from './AuthProvider'
import './auth.css'

type Mode = 'login' | 'register'
type Phase = 'idle' | 'submitting' | 'leaving'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MIN = PASSWORD_MIN_LENGTH
// Whole sign-in → overview hand-off, kept under the 800ms budget (UI-IA §7.5).
const LEAVE_MS = 600

function validate(identifier: string, password: string) {
  const errors: { identifier?: string; password?: string } = {}
  const id = identifier.trim()
  if (!id) errors.identifier = '请输入邮箱或用户名'
  else if (id.includes('@') && !EMAIL_RE.test(id)) errors.identifier = '邮箱格式不正确'
  else if (!id.includes('@') && id.length < 3) errors.identifier = '用户名至少 3 个字符'
  if (!password) errors.password = '请输入密码'
  else if (password.length < PASSWORD_MIN) errors.password = `密码至少 ${PASSWORD_MIN} 个字符`
  return errors
}

// Only allow in-app redirects.
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/overview'
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Light pointer parallax on the mesh, rAF-throttled; removed on unmount. */
function useParallax(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion() || !window.matchMedia('(pointer: fine)').matches) return
    let frame = 0
    let x = 0
    let y = 0
    const onMove = (e: PointerEvent) => {
      x = (e.clientX / window.innerWidth - 0.5) * 24
      y = (e.clientY / window.innerHeight - 0.5) * 24
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        el.style.setProperty('--px', `${x.toFixed(1)}px`)
        el.style.setProperty('--py', `${y.toFixed(1)}px`)
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [ref])
}

export function AuthPage({ mode }: { mode: Mode }) {
  const { status, login, register } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const parallaxRef = useRef<HTMLDivElement>(null)
  useParallax(parallaxRef)

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  // Visitors already signed in skip straight in; a fresh sign-in plays the transition first.
  const [wasAuthedOnMount] = useState(status === 'authenticated')
  useDocumentTitle(mode === 'login' ? '登录' : '注册')

  if (wasAuthedOnMount) return <Navigate to={next} replace />

  const isLogin = mode === 'login'
  const errors = touched ? validate(identifier, password) : {}
  const busy = phase !== 'idle'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setServerError(null)
    const v = validate(identifier, password)
    if (v.identifier || v.password) return
    setPhase('submitting')
    try {
      await (isLogin ? login(identifier, password) : register(identifier, password))
    } catch (err) {
      setServerError(errorMessage(err))
      setPhase('idle')
      return
    }
    if (prefersReducedMotion()) {
      navigate(next, { replace: true, state: { fromAuth: true } })
      return
    }
    setPhase('leaving')
    window.setTimeout(() => navigate(next, { replace: true, state: { fromAuth: true } }), LEAVE_MS)
  }

  return (
    <div className="auth relative min-h-dvh overflow-hidden bg-background" data-phase={phase}>
      <div className="mesh" aria-hidden="true">
        <div className="mesh__parallax" ref={parallaxRef}>
          <div className="mesh__layer">
            <span className="mesh__blob mesh__blob--cyan" />
            <span className="mesh__blob mesh__blob--blue" />
            <span className="mesh__blob mesh__blob--amber" />
          </div>
        </div>
        <div className="mesh__wash" />
      </div>

      <header className="auth__chrome relative z-10 mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <Link to="/login" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.3px] text-foreground">
          <Logo />
          PQL Health
        </Link>
        <div className="flex items-center gap-2">
          <DataSourceBadge />
          <ThemeMenu />
        </div>
      </header>

      <main className="relative z-10 flex min-h-[calc(100dvh-64px)] flex-col items-center justify-center px-4 pb-16">
        <div className="auth__chrome mb-6 text-center">
          <span className="inline-flex h-6 items-center rounded-full bg-surface px-2.5 font-mono text-xs text-body shadow-l1">
            客户健康度 · PQL 运营
          </span>
          <h1 className="heading mt-4 text-[32px] leading-10 text-foreground">
            {isLogin ? '登录你的工作台。' : '创建你的工作台。'}
          </h1>
          <p className="mt-2 text-[15px] text-body">
            {isLogin ? '看清每位客户的阶段、健康与下一步。' : '注册即创建专属租户，三步看到客户健康漏斗。'}
          </p>
        </div>

        <form onSubmit={onSubmit} noValidate className="auth__card w-full max-w-[400px] rounded-xl bg-surface p-8 shadow-l4">
          <div className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="identifier">邮箱或用户名</Label>
              <Input
                id="identifier"
                placeholder="you@company.com 或用户名"
                autoComplete="username"
                autoFocus
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                aria-invalid={errors.identifier ? true : undefined}
                aria-describedby={errors.identifier ? 'identifier-error' : undefined}
                disabled={busy}
              />
              {errors.identifier && (
                <p id="identifier-error" className="animate-fade-in text-xs text-destructive">
                  {errors.identifier}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder={`至少 ${PASSWORD_MIN} 个字符`}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'password-error' : undefined}
                disabled={busy}
              />
              {errors.password && (
                <p id="password-error" className="animate-fade-in text-xs text-destructive">
                  {errors.password}
                </p>
              )}
            </div>

            {serverError && (
              <div role="alert" className="animate-fade-in rounded-md bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive-deep">
                {serverError}
              </div>
            )}

            <Button type="submit" size="lg" className="group w-full" loading={phase === 'submitting'} disabled={busy}>
              {phase === 'leaving' ? (
                <>
                  <Check />
                  正在进入工作台
                </>
              ) : (
                <>
                  {isLogin ? '登录' : '注册并进入'}
                  {phase === 'idle' && <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />}
                </>
              )}
            </Button>
          </div>

          <p className="mt-6 text-center text-[13px] text-body">
            {isLogin ? '还没有账号？' : '已有账号？'}
            <Link
              to={isLogin ? `/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}` : '/login'}
              className="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
            >
              {isLogin ? '注册' : '登录'}
            </Link>
          </p>
        </form>
      </main>
    </div>
  )
}
