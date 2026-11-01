import { useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { History, Sparkles } from 'lucide-react'
import { Page, PageHeader } from '@/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorBanner } from '@/components/EmptyState'
import { Markdown } from '@/components/Markdown'
import { MonoTag } from '@/components/Tags'
import { errorMessage, request } from '@/lib/api'
import { SKILL_LABEL } from '@/lib/dictionary'
import { formatDateTime } from '@/lib/format'
import { useRequest } from '@/lib/useRequest'
import type { AnalysisParams, AnalysisRun, AnalysisTone } from '@/lib/types'
import { cn } from '@/lib/utils'

const SKILL_ID = 'weekly_focus_v1'

const TONES: Record<AnalysisTone, string> = { pragmatic: '务实', executive: '高管摘要' }
const MODES: Record<string, string> = { llm: '模型生成', rules_only: '规则兜底' }

const DEFAULT_PARAMS: AnalysisParams = { focus_window_days: 7, risk_limit: 10, pql_limit: 10, tone: 'pragmatic', language: 'zh-CN' }

// Mirrors normalize_params() in apps/api/app/skills/weekly_focus_v1.py
const LIMITS = {
  focus_window_days: { label: '关注窗口（天）', max: 365 },
  risk_limit: { label: '风险名单条数', max: 100 },
  pql_limit: { label: 'PQL 名单条数', max: 100 },
} as const
type NumKey = keyof typeof LIMITS

export function Analysis() {
  const history = useRequest(() => request<AnalysisRun[]>('/analysis/runs'), [])
  const [params, setParams] = useState<AnalysisParams>(DEFAULT_PARAMS)
  const [draft, setDraft] = useState<Record<NumKey, string>>({ focus_window_days: '7', risk_limit: '10', pql_limit: '10' })
  const [current, setCurrent] = useState<AnalysisRun | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Until the user picks or generates a run, show the latest one from history.
  const shown = current ?? history.data?.[0] ?? null

  const invalid = (Object.keys(LIMITS) as NumKey[]).find((k) => {
    const n = Number(draft[k])
    return !Number.isInteger(n) || n < 1 || n > LIMITS[k].max
  })

  async function generate() {
    if (invalid) return
    setRunning(true)
    setError(null)
    const body = {
      skill_id: SKILL_ID,
      params: { ...params, focus_window_days: Number(draft.focus_window_days), risk_limit: Number(draft.risk_limit), pql_limit: Number(draft.pql_limit) },
    }
    try {
      const run = await request<AnalysisRun>('/analysis/runs', { method: 'POST', body })
      setCurrent(run)
      toast.success(run.mode === 'llm' ? '分析已生成' : '已生成规则兜底分析')
      void history.reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Page title="每周重点分析">
      <PageHeader title="每周重点分析" description="基于当前租户的漏斗、风险与 PQL 名单，一次生成本周运营重点。" />

      <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>分析参数</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field label="分析技能">
                <Select value={SKILL_ID} disabled>
                  <SelectTrigger aria-label="分析技能">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SKILL_ID}>{SKILL_LABEL[SKILL_ID]}</SelectItem>
                  </SelectContent>
                </Select>
                <span className="font-mono text-[11px] text-mute">{SKILL_ID}</span>
              </Field>

              {(Object.keys(LIMITS) as NumKey[]).map((k) => {
                const bad = invalid === k
                return (
                  <Field key={k} label={LIMITS[k].label} htmlFor={`p-${k}`}>
                    <Input
                      id={`p-${k}`}
                      inputMode="numeric"
                      className="h-8 text-[13px]"
                      value={draft[k]}
                      aria-invalid={bad || undefined}
                      onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value.replace(/[^\d]/g, '') }))}
                    />
                    {bad && <span className="text-xs text-destructive">请输入 1–{LIMITS[k].max} 的整数</span>}
                  </Field>
                )
              })}

              <Field label="语气">
                <Select value={params.tone} onValueChange={(v) => setParams((p) => ({ ...p, tone: v as AnalysisTone }))}>
                  <SelectTrigger aria-label="语气">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TONES) as AnalysisTone[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TONES[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="语言">
                <Select value="zh-CN" disabled>
                  <SelectTrigger aria-label="语言">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh-CN">简体中文</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Button className="mt-1 w-full" loading={running} disabled={Boolean(invalid)} onClick={generate}>
                <Sparkles />
                生成分析
              </Button>
            </CardContent>
          </Card>

          <HistoryCard
            runs={history.data}
            loading={history.loading && !history.data}
            error={history.error}
            currentId={shown?.id}
            onPick={setCurrent}
          />
        </div>

        <div className="grid gap-4">
          {error && <ErrorBanner message={error} />}
          <ResultCard run={shown} running={running} />
        </div>
      </div>
    </Page>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-normal text-body">
        {label}
      </Label>
      {children}
    </div>
  )
}

function ResultCard({ run, running }: { run: AnalysisRun | null; running: boolean }) {
  if (running) {
    return (
      <Card>
        <CardContent className="grid gap-4 p-6">
          <span className="text-[13px] text-body">分析生成中…</span>
          <Skeleton className="h-6 w-1/3" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-3.5" style={{ width: `${90 - i * 8}%` }} />
          ))}
          <Skeleton className="h-32 rounded-lg" />
        </CardContent>
      </Card>
    )
  }
  if (!run) {
    return (
      <Card>
        <EmptyState
          icon={<Sparkles />}
          title="还没有分析报告"
          description="选择参数后点击「生成分析」。未配置模型密钥时，会直接给出基于规则的兜底分析。"
        />
      </Card>
    )
  }
  const rules = run.mode !== 'llm'
  const p = run.params_json ?? {}
  return (
    <Card key={run.id} className="animate-fade-in overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-5 py-3 text-xs text-mute">
        <Meta label="方式">
          <span className="text-foreground">{MODES[run.mode] ?? run.mode}</span>
        </Meta>
        <Meta label="耗时">
          <span className="num font-mono text-foreground">{run.latency_ms ?? '—'} ms</span>
        </Meta>
        <Meta label="技能">
          <MonoTag>{run.skill_id}</MonoTag>
        </Meta>
        <Meta label="参数">
          <span className="text-foreground">
            {p.focus_window_days ?? '—'} 天 · 风险 {p.risk_limit ?? '—'} · PQL {p.pql_limit ?? '—'} · {TONES[p.tone as AnalysisTone] ?? '务实'}
          </span>
        </Meta>
        <span className="ml-auto font-mono">{formatDateTime(run.created_at)}</span>
      </div>
      <CardContent className="grid gap-5 p-6">
        {rules && (
          <div role="status" className="rounded-lg bg-warning-soft px-4 py-3 text-[13px] leading-5 text-warning-deep">
            {run.error ? (
              <>当前为规则兜底结果：模型调用未成功（{run.error.replace(/已回退规则报告。?$/, '').trim()}）。</>
            ) : (
<>当前为规则兜底结果，未调用模型（尚未配置模型密钥）。名单与数字均直接来自评分结果。</>
            )}
          </div>
        )}
        {run.report_md ? (
          <Markdown source={run.report_md} hideQuote={/^Banner[:：]/} />
        ) : (
          <p className="text-[13px] text-mute">本次分析没有生成报告内容。</p>
        )}
      </CardContent>
    </Card>
  )
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono">{label}</span>
      {children}
    </span>
  )
}

function HistoryCard({
  runs,
  loading,
  error,
  currentId,
  onPick,
}: {
  runs: AnalysisRun[] | null
  loading: boolean
  error: string | null
  currentId?: string
  onPick: (r: AnalysisRun) => void
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>历史记录</CardTitle>
        <span className="font-mono text-xs text-mute">最近 20 次</span>
      </CardHeader>
      {error ? (
        <div className="p-4">
          <ErrorBanner message={error} />
        </div>
      ) : loading ? (
        <div className="grid gap-2 p-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      ) : !runs || runs.length === 0 ? (
        <div className="flex items-center gap-2 px-5 py-6 text-[13px] text-mute">
          <History className="size-4" />
          暂无历史分析
        </div>
      ) : (
        <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
          {runs.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick(r)}
                aria-current={r.id === currentId || undefined}
                className={cn(
                  'flex w-full items-center gap-3 px-5 py-2.5 text-left text-[13px] transition-colors duration-150 hover:bg-surface-2',
                  r.id === currentId && 'bg-surface-2',
                )}
              >
                <span className="font-mono text-xs text-foreground">{formatDateTime(r.created_at)}</span>
                <span className="ml-auto text-xs text-mute">{MODES[r.mode] ?? r.mode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
