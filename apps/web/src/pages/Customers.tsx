import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, RefreshCw, Search, Users } from 'lucide-react'
import { Page, PageHeader } from '@/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, ErrorBanner } from '@/components/EmptyState'
import { HealthDot, PqlTag, StageTag } from '@/components/Tags'
import { errorMessage, request } from '@/lib/api'
import { ACTIONS, HEALTH_LEVELS, STAGES, STAGE_ORDER } from '@/lib/dictionary'
import type { HealthLevel } from '@/lib/dictionary'
import { formatDateTime } from '@/lib/format'
import { generateSynthetic } from '@/lib/synthetic'
import { useRequest } from '@/lib/useRequest'
import type { CustomerList } from '@/lib/types'
import { CustomerDrawer } from './CustomerDrawer'

const PAGE_SIZE = 20
const ALL = 'all'

const STAGE_OPTIONS = [{ value: ALL, label: '全部阶段' }, ...STAGE_ORDER.map((s) => ({ value: s, label: STAGES[s].label }))]
const PQL_OPTIONS = [
  { value: ALL, label: '全部 PQL' },
  { value: 'true', label: '仅 PQL' },
  { value: 'false', label: '非 PQL' },
]
const HEALTH_OPTIONS = [
  { value: ALL, label: '全部健康等级' },
  ...(Object.keys(HEALTH_LEVELS) as HealthLevel[]).map((k) => ({ value: k, label: HEALTH_LEVELS[k].label })),
]

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return v
}

function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  label: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="min-w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function Customers() {
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState(ALL)
  const [pql, setPql] = useState(ALL)
  const [health, setHealth] = useState(ALL)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const q = useDebounced(search.trim(), 300)

  // A new search returns to page 1 (select filters reset the page in their handlers).
  useEffect(() => setPage(1), [q])

  const { data, error, loading, reload } = useRequest(() => {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) })
    if (q) params.set('q', q)
    if (stage !== ALL) params.set('stage', stage)
    if (pql !== ALL) params.set('is_pql', pql)
    if (health !== ALL) params.set('health', health)
    return request<CustomerList>(`/customers?${params}`)
  }, [q, stage, pql, health, page])

  const rows = data?.items ?? []

  const hasFilters = Boolean(q || stage !== ALL || pql !== ALL || health !== ALL)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  const withPageReset = (set: (v: string) => void) => (v: string) => {
    set(v)
    setPage(1)
  }

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

  return (
    <Page title="客户">
      <PageHeader title="客户" description="阶段、健康分、PQL 与建议动作。点击任意一行查看详情。" />

      <div className="grid gap-4">
        {error && <ErrorBanner message={error} onRetry={() => void reload()} />}

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-mute" />
              <Input
                className="h-8 pl-8 text-[13px]"
                placeholder="搜索名称或外部 ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="搜索客户"
              />
            </div>
            <FilterSelect label="阶段" value={stage} onChange={withPageReset(setStage)} options={STAGE_OPTIONS} />
            <FilterSelect label="是否 PQL" value={pql} onChange={withPageReset(setPql)} options={PQL_OPTIONS} />
            <FilterSelect label="健康等级" value={health} onChange={withPageReset(setHealth)} options={HEALTH_OPTIONS} />
            <div className="flex-1" />
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setStage(ALL)
                  setPql(ALL)
                  setHealth(ALL)
                  setPage(1)
                }}
              >
                清除筛选
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
              <RefreshCw />
              刷新
            </Button>
          </div>

          {loading && !data ? (
            <TableSkeleton />
          ) : rows.length === 0 ? (
            hasFilters ? (
              <EmptyState icon={<Search />} title="没有符合条件的客户" description="试试调整筛选条件或清除搜索。" />
            ) : (
              <EmptyState
                icon={<Users />}
                title="还没有客户"
                description="生成演示数据或上传 CSV 后，这里会列出每位客户的阶段、健康分与建议动作。"
                actions={
                  <>
                    <Button loading={generating} onClick={onGenerate}>
                      生成演示数据
                    </Button>
                    <Button variant="outline" asChild>
                      <Link to="/data">上传 CSV</Link>
                    </Button>
                  </>
                }
              />
            )
          ) : (
            <div className="transition-opacity duration-200" style={{ opacity: loading ? 0.6 : 1 }}>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>名称</TableHead>
                    <TableHead>阶段</TableHead>
                    <TableHead className="text-right">健康分</TableHead>
                    <TableHead className="text-right">PQL 分</TableHead>
                    <TableHead>PQL</TableHead>
                    <TableHead>建议动作</TableHead>
                    <TableHead>最近活跃</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => {
                    return (
                      <TableRow
                        key={c.id}
                        tabIndex={0}
                        data-state={selectedId === c.id ? 'selected' : undefined}
                        className="cursor-pointer focus-visible:bg-surface-2/60"
                        onClick={() => setSelectedId(c.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedId(c.id)
                          }
                        }}
                      >
                        <TableCell>
                          <div className="grid gap-0.5">
                            <span className="font-medium text-foreground">{c.name}</span>
                            <span className="font-mono text-[11px] text-mute">{c.external_id}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StageTag stage={c.stage} />
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="num inline-flex items-center gap-2 text-foreground">
                            <HealthDot score={c.health_score} />
                            {c.health_score}
                          </span>
                        </TableCell>
                        <TableCell className="num text-right">{c.pql_score}</TableCell>
                        <TableCell>{c.is_pql ? <PqlTag /> : <span className="text-mute">—</span>}</TableCell>
                        <TableCell className="max-w-[280px] truncate" title={ACTIONS[c.suggested_action]}>
                          {ACTIONS[c.suggested_action] ?? '—'}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{formatDateTime(c.last_active_at)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {data && data.total > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-mute">
              <span>
                {hasFilters ? '筛选后' : '共'} <span className="num">{data.total}</span> 位客户
              </span>
              <div className="flex items-center gap-2">
                <span className="num font-mono">
                  {page} / {totalPages}
                </span>
                <Button variant="outline" size="icon-sm" aria-label="上一页" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft />
                </Button>
                <Button variant="outline" size="icon-sm" aria-label="下一页" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <CustomerDrawer customerId={selectedId} onClose={() => setSelectedId(null)} />
    </Page>
  )
}

function TableSkeleton() {
  return (
    <div className="grid gap-0 px-4 py-2">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_3fr_1.5fr] gap-4 py-4">
          {Array.from({ length: 7 }, (_, j) => (
            <Skeleton key={j} className="h-3.5" style={{ width: j === 0 ? '70%' : '60%' }} />
          ))}
        </div>
      ))}
    </div>
  )
}
