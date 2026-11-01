import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { HEALTH_LEVELS, SOURCES, STAGES, healthLevel } from '@/lib/dictionary'
import { cn } from '@/lib/utils'

/** PQL marker: ink hairline outline on a light fill — no saturated colour. */
export function PqlTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full bg-surface-2 px-2 font-mono text-[11px] font-medium text-foreground ring-1 ring-foreground/55 ring-inset',
        className,
      )}
    >
      PQL
    </span>
  )
}

export function StageTag({ stage }: { stage: string }) {
  const st = (STAGES as Record<string, { label: string; tone: 'gray' | 'risk' | 'churn' }>)[stage]
  if (!st) return <MonoTag>{stage}</MonoTag>
  return <Badge tone={st.tone}>{st.label}</Badge>
}

/** Raw / unmapped codes: mono, gray, never translated. */
export function MonoTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code className={cn('rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] leading-4 text-body', className)}>{children}</code>
  )
}

/**
 * Enum value → Chinese label from a frontend constant map.
 * Empty values render nothing; unknown values are shown verbatim in a mono tag.
 */
export function EnumLabel({ value, map, className }: { value: string | null | undefined; map: Record<string, string>; className?: string }) {
  if (value === null || value === undefined || value.trim() === '') return null
  const label = map[value]
  if (!label) return <MonoTag className={className}>{value}</MonoTag>
  return <span className={className}>{label}</span>
}

export function SourceLabel({ source }: { source: string | null | undefined }) {
  if (!source) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs text-mute">
      来源：
      <EnumLabel value={source} map={SOURCES} />
    </span>
  )
}

export function HealthDot({ score, className }: { score: number; className?: string }) {
  return <span className={cn('size-1.5 shrink-0 rounded-full', className)} style={{ background: HEALTH_LEVELS[healthLevel(score)].dot }} />
}
