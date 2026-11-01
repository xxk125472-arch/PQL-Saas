import * as React from 'react'
import { cn } from '@/lib/utils'

// Static block that fades in — no shimmer loop (UI-IA §7.5: no continuous animation after login).
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('animate-fade-in rounded-md bg-surface-2', className)} {...props} />
}

export { Skeleton }
