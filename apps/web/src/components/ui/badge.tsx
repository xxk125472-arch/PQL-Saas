import * as React from 'react'
import { cn } from '@/lib/utils'

export type BadgeTone = 'gray' | 'blue' | 'teal' | 'violet' | 'mint' | 'amber' | 'red' | 'pink' | 'risk' | 'churn'

// Low-saturation fill + same-hue text (UI-IA §7.3). Hue values live in index.css.
const HUE: Record<BadgeTone, string> = {
  gray: 'var(--hue-gray)',
  blue: 'var(--hue-blue)',
  teal: 'var(--hue-teal)',
  violet: 'var(--hue-violet)',
  mint: 'var(--hue-mint)',
  amber: 'var(--hue-amber)',
  red: 'var(--hue-red)',
  pink: 'var(--hue-pink)',
  risk: 'var(--hue-risk)',
  churn: 'var(--hue-churn)',
}

type BadgeProps = React.ComponentProps<'span'> & { tone?: BadgeTone }

function Badge({ tone = 'gray', className, style, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn('inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap', className)}
      style={{
        color: HUE[tone],
        backgroundColor: `color-mix(in srgb, ${HUE[tone]} var(--tag-alpha), transparent)`,
        ...style,
      }}
      {...props}
    />
  )
}

export { Badge, HUE }
