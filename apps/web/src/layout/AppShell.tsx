import { useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { ChevronsUpDown, Database, LayoutGrid, LogOut, Settings, Sparkles, Users } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Logo } from '@/components/Logo'
import { ThemeRadioItems } from '@/components/ThemeMenu'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FEATURE_LABEL, MOCKED_FEATURES } from '@/lib/backend'
import { cn } from '@/lib/utils'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

const links = [
  { to: '/overview', label: '总览', Icon: LayoutGrid },
  { to: '/customers', label: '客户', Icon: Users },
  { to: '/data', label: '数据中心', Icon: Database },
  { to: '/analysis', label: '分析', Icon: Sparkles },
  { to: '/settings', label: '设置', Icon: Settings },
]

export function AppShell() {
  const { status, user, logout } = useAuth()
  const location = useLocation()
  // Overview content rises 12px only when arriving from the sign-in transition (UI-IA §7.2).
  const [fromAuth] = useState(() => Boolean((location.state as { fromAuth?: boolean } | null)?.fromAuth))

  if (status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="animate-fade-in flex flex-col items-center gap-3 text-[13px] text-body">
          <Logo size={28} />
          正在验证登录状态…
        </div>
      </div>
    )
  }

  if (status !== 'authenticated' || !user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  const name = user.email ?? user.username ?? '用户'

  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-1 border-b border-border bg-background px-3 py-3 md:sticky md:top-0 md:h-dvh md:self-start md:overflow-y-auto md:border-r md:border-b-0">
        <div className="flex h-10 items-center gap-2.5 px-2">
          <Logo />
          <span className="text-sm font-semibold tracking-[-0.28px]">PQL Health</span>
        </div>

        <div className="hidden px-2 pt-4 pb-1.5 font-mono text-xs text-mute md:block">工作台</div>
        <nav aria-label="主导航" className="flex flex-wrap gap-0.5 md:grid">
          {links.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'relative flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-body transition-colors duration-150 hover:bg-surface-2 hover:text-foreground',
                  // ex-app-shell-row: ink left-edge indicator for the active row
                  isActive &&
                    'bg-surface-2 font-medium text-foreground before:absolute before:top-1.5 before:bottom-1.5 before:-left-3 before:w-0.5 before:rounded-full before:bg-primary',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="md:mt-auto">
          <UserMenu name={name} tenant={user.tenant_name} onLogout={logout} />
        </div>
      </aside>

      <main className={cn('min-w-0', fromAuth && 'animate-enter-up')}>
        <Outlet />
      </main>
    </div>
  )
}

function UserMenu({ name, tenant, onLogout }: { name: string; tenant: string; onLogout: () => Promise<void> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors duration-150 outline-none hover:bg-surface-2 data-[state=open]:bg-surface-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground uppercase">
          {name.slice(0, 1)}
        </span>
        <span className="grid min-w-0 flex-1 leading-4">
          <span className="truncate text-[13px] font-medium">{name}</span>
          <span className="truncate text-xs text-mute">{tenant}</span>
        </span>
        <ChevronsUpDown className="size-3.5 text-mute" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56">
        <DropdownMenuLabel>后端</DropdownMenuLabel>
        <div className="grid gap-1.5 px-2 pb-2">
          <DataSourceBadge />
          {MOCKED_FEATURES.length > 0 && (
            <span className="text-xs leading-4 text-mute">仍为模拟：{MOCKED_FEATURES.map((f) => FEATURE_LABEL[f]).join('、')}</span>
          )}
        </div>
        <DropdownMenuSeparator />
        <ThemeRadioItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void onLogout()}>
          <LogOut />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="heading text-2xl leading-8">{title}</h1>
        {description && <p className="mt-1 text-sm text-body">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  )
}

/** Page container: 150–200ms fade + 8px rise on route change (UI-IA §7.4). */
export function Page({ title, children }: { title: string; children: ReactNode }) {
  const { pathname } = useLocation()
  useDocumentTitle(title)
  return (
    <div key={pathname} className="animate-page-in mx-auto max-w-[1280px] px-4 pt-7 pb-16 md:px-8">
      {children}
    </div>
  )
}
