import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex h-9 items-center gap-1 border-b border-border', className)} {...props} />
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative -mb-px inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm text-body transition-colors duration-150 outline-none',
        'hover:text-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('animate-page-in outline-none', className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
