import type { ReactNode } from 'react'

// ex-empty-state-card: generous padding, quiet icon tile, one line + primary action.
export function EmptyState({
  icon,
  title,
  description,
  actions,
}: {
  icon?: ReactNode
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="animate-fade-in flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="grid size-10 place-items-center rounded-lg bg-surface-2 text-body [&_svg]:size-5">{icon}</div>}
      <div className="text-sm font-medium">{title}</div>
      {description && <div className="max-w-sm text-[13px] text-body">{description}</div>}
      {actions && <div className="mt-2 flex gap-2">{actions}</div>}
    </div>
  )
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="animate-fade-in flex items-center gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-[13px] text-destructive-deep">
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-medium underline-offset-4 hover:underline">
          重试
        </button>
      )}
    </div>
  )
}
