import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorBanner } from '@/components/EmptyState'
import { errorMessage, request } from '@/lib/api'
import { ACTIONS, EVENT_TYPES, HEALTH_FACTORS, HEALTH_LEVELS, PQL_FACTORS, SOURCES, STAGES, healthLevel } from '@/lib/dictionary'
import { formatDateTime, parseDate } from '@/lib/format'
import type { CustomerDetail, CustomerEvent } from '@/lib/types'

const MILESTONES = [
  { type: 'install', label: '安装' },
  { type: 'first_value', label: '首次价值' },
  { type: 'reuse', label: '复用' },
  { type: 'retention_active', label: '留存活跃' },
]

// Earliest occurrence of each milestone event, oldest first.
function deriveTimeline(events: CustomerEvent[]) {
  return MILESTONES.flatMap((m) => {
    const hits = events.filter((e) => e.event_type === m.type)
    if (hits.length === 0) return []
    const first = hits.reduce((a, b) => (parseDate(a.occurred_at) < parseDate(b.occurred_at) ? a : b))
    return [{ ...m, at: first.occurred_at }]
  }).sort((a, b) => parseDate(a.at).getTime() - parseDate(b.at).getTime())
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="mb-3 font-mono text-xs text-mute">{children}</h3>
}

export function CustomerDrawer({ customerId, onClose }: { customerId: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!customerId) return
    let cancelled = false
    setDetail((d) => (d?.id === customerId ? d : null))
    setError(null)
    request<CustomerDetail>(`/customers/${encodeURIComponent(customerId)}`)
      .then((d) => !cancelled && setDetail(d))
      .catch((err) => !cancelled && setError(errorMessage(err)))
    return () => {
      cancelled = true
    }
  }, [customerId, attempt])

  const stage = detail ? (STAGES[detail.stage] ?? { label: detail.stage, tone: 'gray' as const }) : null
  const score = detail?.score

  return (
    <Sheet open={Boolean(customerId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{detail?.name ?? (error ? '加载失败' : '客户详情')}</SheetTitle>
          {detail ? (
            <SheetDescription asChild>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {stage && <Badge tone={stage.tone}>{stage.label}</Badge>}
                {score?.is_pql && <Badge tone="pink">PQL</Badge>}
                <span className="font-mono text-xs text-mute">{detail.external_id}</span>
                <span className="text-xs text-mute">· 来源：{SOURCES[detail.source] ?? detail.source}</span>
              </div>
            </SheetDescription>
          ) : (
            !error && <Skeleton className="mt-2 h-5 w-48" />
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <ErrorBanner message={error} onRetry={() => setAttempt((a) => a + 1)} />
          ) : !detail ? (
            <DrawerSkeleton />
          ) : (
            <div key={detail.id} className="animate-fade-in grid gap-7">
              <div className="grid grid-cols-3 overflow-hidden rounded-lg shadow-l1">
                <Kpi label="健康分">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: HEALTH_LEVELS[healthLevel(score?.health_score ?? 0)].dot }} />
                    {score?.health_score ?? '—'}
                  </span>
                </Kpi>
                <Kpi label="PQL 分">{score?.pql_score ?? '—'}</Kpi>
                <Kpi label="最近活跃" small>
                  {formatDateTime(detail.last_active_at)}
                </Kpi>
              </div>

              <ActionNote score={score ?? null} />

              <section>
                <SectionTitle>分数拆解</SectionTitle>
                {score ? (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FactorGroup title="健康分因子" labels={HEALTH_FACTORS} values={score.health_breakdown} />
                    <FactorGroup title="PQL 因子" labels={PQL_FACTORS} values={score.pql_breakdown} />
                  </div>
                ) : (
                  <p className="text-[13px] text-mute">暂无分数，导入事件后会自动计算。</p>
                )}
              </section>

              <section>
                <SectionTitle>阶段时间线</SectionTitle>
                <Timeline events={detail.events} />
              </section>

              <section>
                <SectionTitle>最近事件</SectionTitle>
                {detail.events.length === 0 ? (
                  <p className="text-[13px] text-mute">暂无事件记录。</p>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-lg shadow-l1">
                    {detail.events.slice(0, 20).map((e) => (
                      <li key={e.id} className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px]">
                        <span className="text-foreground">{EVENT_TYPES[e.event_type] ?? e.event_type}</span>
                        {e.feature_key && <span className="font-mono text-xs text-mute">{e.feature_key}</span>}
                        <span className="ml-auto font-mono text-xs text-mute">{formatDateTime(e.occurred_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ActionNote({ score }: { score: CustomerDetail['score'] }) {
  const action = score ? ACTIONS[score.suggested_action] ?? score.suggested_action : ACTIONS.maintain
  const reason = score ? score.action_reason : '分数尚未计算，暂按「保持观察」处理。'
  return (
    <div className="rounded-lg bg-surface-2 px-4 py-3.5 text-[13px] leading-5 text-body">
      <div className="font-mono text-xs text-mute">建议动作</div>
      <div className="mt-1 font-medium text-foreground">{action}</div>
      {/* The backend reason often repeats the action label; only show it when it adds something. */}
      {reason && reason !== action && <div className="mt-1">{reason}</div>}
    </div>
  )
}

function Kpi({ label, children, small }: { label: string; children: ReactNode; small?: boolean }) {
  return (
    <div className="grid gap-1.5 border-r border-border px-4 py-3 last:border-r-0">
      <span className="font-mono text-xs text-mute">{label}</span>
      <span className={small ? 'num text-[13px] font-medium' : 'num heading text-xl leading-7'}>{children}</span>
    </div>
  )
}

function FactorGroup({ title, labels, values }: { title: string; labels: Record<string, string>; values: Record<string, number> | null }) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-body">{title}</div>
      {Object.keys(labels).map((k) => {
        const v = values?.[k]
        return (
          <div key={k} className="grid h-7 grid-cols-[84px_minmax(0,1fr)_32px] items-center gap-3 text-[13px]">
            <span className="text-body">{labels[k]}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full origin-left rounded-full bg-primary"
                style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%`, animation: 'grow-x 400ms cubic-bezier(0.32,0.72,0,1) both' }}
              />
            </div>
            <span className="num text-right text-foreground">{v === undefined ? '—' : Math.round(v)}</span>
          </div>
        )
      })}
    </div>
  )
}

function Timeline({ events }: { events: CustomerEvent[] }) {
  const nodes = deriveTimeline(events)
  if (nodes.length === 0) return <p className="text-[13px] text-mute">尚未发生阶段事件（新客）。</p>
  return (
    <ol className="relative grid gap-3.5 pl-5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-border">
      {nodes.map((n) => (
        <li key={n.type} className="relative flex justify-between gap-3 text-[13px]">
          <span className="absolute top-1.5 -left-5 size-[11px] rounded-full border-2 border-primary bg-surface" />
          <span className="text-foreground">{n.label}</span>
          <span className="font-mono text-xs text-mute">{formatDateTime(n.at)}</span>
        </li>
      ))}
    </ol>
  )
}

function DrawerSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-[72px] rounded-lg" />
      <Skeleton className="h-14 rounded-lg" />
      <div className="grid gap-2.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-3.5" />
        ))}
      </div>
      <Skeleton className="h-36 rounded-lg" />
    </div>
  )
}
