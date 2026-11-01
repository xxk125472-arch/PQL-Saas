import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Right-side drawer: 240ms slide with cubic-bezier(0.32,0.72,0,1), scrim fades (UI-IA §7.4).

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close

function SheetContent({ className, children, ...props }: React.ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] data-[state=closed]:animate-[fade-out_200ms_ease-out_forwards] data-[state=open]:animate-[fade-in_200ms_ease-out]" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[520px] flex-col bg-surface shadow-l5 outline-none',
          'data-[state=open]:animate-[sheet-in_240ms_cubic-bezier(0.32,0.72,0,1)] data-[state=closed]:animate-[sheet-out_200ms_cubic-bezier(0.32,0.72,0,1)_forwards]',
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute top-3.5 right-3.5 grid size-8 place-items-center rounded-md text-body transition-colors hover:bg-surface-2 hover:text-foreground">
          <X className="size-4" />
          <span className="sr-only">关闭</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('border-b border-border px-6 py-4 pr-14', className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn('heading text-lg leading-7', className)} {...props} />
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn('text-[13px] text-body', className)} {...props} />
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription }
