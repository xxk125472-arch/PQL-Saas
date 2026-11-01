import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowRight, Database, LayoutGrid, RefreshCw, Users } from 'lucide-react'
import { Page, PageHeader } from '@/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorBanner } from '@/components/EmptyState'
import { errorMessage, request } from '@/lib/api'
import { formatNumber, formatPercent } from '@/lib/format'
import { generateSynthetic } from '@/lib/synthetic'
import { useCountUp } from '@/lib/useCountUp'
import { useRequest } from '@/lib/useRequest'
import type { Funnel } from '@/lib/types'

const STEPS = [
  { key: 'installed', label: '安装', rateKey: null },
  { key: 'first_value', label: '首次价值', rateKey: 'installed_to_first_value' },
  { key: 'reuse', label: '复用', rateKey: 'first_value_to_reuse' },
  { key: 'retention', label: '留存', rateKey: 'reuse_to_retention' },
] as const

export function Overview() {
  const { data, error, loading, reload } = useRequest(() => request<Funnel>('/overview/funnel'), [])
  const [generating, setGenerating] = useState(false)

  async function onGenerate() {
    setGenerating(true)
    try {
      const res = await generateSynthetic()
      toast.success(`已生成 ${res.customers} 位演示客户`)
      await reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  const initialLoading = loading && !data
  const isEmpty = data?.customer_total === 0

  return (
    <Page>
      <PageHeader
        title="总览"
        description="当前租户的生命周期漏斗与关键客户指标。"
        actions={
          <Button variant="outline" onClick={() => void reload()} disabled={loading}>
            <RefreshCw />
            刷新
          </Button>
        }
      />

      <div className="grid gap-4">
        {error && <ErrorBanner message={error} onRetry={() => void reload()} />}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="客户总数" value={data?.customer_total} loading={initialLoading} />
          <Stat label="PQL 数" value={data?.pql_count} loading={initialLoading} hint="PQL 分 ≥ 阈值且已达首次价值" />
          <Stat label="风险客户" value={data?.at_risk_count} loading={initialLoading} hint="超过 7 天无事件" dot="var(--warning)" />
          <Stat label="流失" value={data?.churned_count} loading={initialLoading} hint="超过 30 天无事件" dot="var(--destructive)" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>生命周期漏斗</CardTitle>
            <span className="font-mono text-xs text-mute">转化率 = 本档 / 上一档</span>
          </CardHeader>
          <CardContent>
            {initialLoading ? (
              <FunnelSkeleton />
            ) : isEmpty ? (
              <EmptyState
                icon={<LayoutGrid />}
                title="还没有客户数据"
                description="生成一批演示数据即可看到漏斗、健康分与建议动作；也可以去数据中心上传 CSV。"
                actions={
                  <>
                    <Button loading={generating} onClick={onGenerate}>
                      生成演示数据
                    </Button>
                    <Button variant="outline" asChild>
                      <Link to="/data">去数据中心</Link>
                    </Button>
                  </>
                }
              />
            ) : (
              data && <FunnelChart data={data} />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2">
          <QuickLink to="/customers" icon={<Users />} title="去客户列表" desc="按阶段、PQL、健康等级筛选并查看详情" />
          <QuickLink to="/data" icon={<Database />} title="去数据中心" desc="合成演示数据、上传 CSV、飞书只读同步" />
        </div>
      </div>
    </Page>
  )
}

function Stat({ label, value, loading, hint, dot }: { label: string; value?: number; loading: boolean; hint?: string; dot?: string }) {
  const shown = useCountUp(value)
  return (
    <Card className="grid gap-2.5 p-5">
      <div className="flex items-center gap-2 font-mono text-xs text-mute">
        {dot && <span className="size-1.5 rounded-full" style={{ background: dot }} />}
        {label}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <div className="num heading text-[32px] leading-8 tracking-[-1.28px]">{value === undefined ? '—' : formatNumber(shown)}</div>
      )}
      {hint && <div className="text-xs text-mute">{hint}</div>}
    </Card>
  )
}

function FunnelChart({ data }: { data: Funnel }) {
  const max = Math.max(data.installed, 1)
  return (
    <div className="grid gap-1">
      {STEPS.map((s, i) => {
        const count = data[s.key]
        return (
          <div key={s.key} className="grid min-h-12 grid-cols-[88px_minmax(0,1fr)_56px] items-center gap-4 sm:grid-cols-[96px_minmax(0,1fr)_64px_104px]">
            <div className="grid gap-0.5">
              <span className="font-mono text-[11px] text-mute">0{i + 1}</span>
              <span className="text-sm font-medium">{s.label}</span>
            </div>
            <div className="h-7 overflow-hidden rounded-md bg-surface-2">
              <div
                className="h-full origin-left rounded-md bg-primary"
                style={{
                  width: `${(count / max) * 100}%`,
                  opacity: 1 - i * 0.18,
                  animation: `grow-x 500ms cubic-bezier(0.32,0.72,0,1) ${i * 70}ms both`,
                }}
              />
            </div>
            <FunnelCount value={count} />
            <div className="hidden text-right text-xs text-mute sm:block">
              {s.rateKey ? (
                <>
                  转化 <span className="num font-medium text-body">{formatPercent(data.conversion_rates[s.rateKey])}</span>
                </>
              ) : (
                '起点'
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FunnelCount({ value }: { value: number }) {
  const shown = useCountUp(value)
  return <div className="num text-right text-base font-semibold">{formatNumber(shown)}</div>
}

function FunnelSkeleton() {
  return (
    <div className="grid gap-1">
      {STEPS.map((s, i) => (
        <div key={s.key} className="grid min-h-12 grid-cols-[96px_minmax(0,1fr)_64px] items-center gap-4">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-7" style={{ width: `${100 - i * 20}%` }} />
          <Skeleton className="ml-auto h-4 w-10" />
        </div>
      ))}
    </div>
  )
}

function QuickLink({ to, icon, title, desc }: { to: string; icon: ReactNode; title: string; desc: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3.5 rounded-lg bg-surface p-4 shadow-l2 transition-colors duration-200 hover:bg-surface-2/60">
      <span className="grid size-9 place-items-center rounded-md bg-surface-2 text-body [&_svg]:size-4">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-mute">{desc}</span>
      </span>
      <ArrowRight className="ml-auto size-4 text-mute transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  )
}
