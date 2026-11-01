import * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-sm text-foreground transition-[border-color,box-shadow] duration-150 outline-none',
        'placeholder:text-mute hover:border-border-strong/60 focus-visible:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
