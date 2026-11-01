import { useEffect, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Download, FileText, Link2, Sparkles, Trash2, Upload } from 'lucide-react'
import { Page, PageHeader } from '@/layout/AppShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ErrorBanner } from '@/components/EmptyState'
import { FeishuSyncSummary } from '@/components/FeishuSyncSummary'
import { errorMessage, request } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { getFeishuConfig, syncFeishu, syncSummary } from '@/lib/feishu'
import { deleteSynthetic, generateSynthetic } from '@/lib/synthetic'
import type { CsvUploadResult, FeishuSyncResult } from '@/lib/types'

const MAX_BYTES = 2 * 1024 * 1024

type JobType = 'synthetic' | 'synthetic_delete' | 'csv_customers' | 'csv_events' | 'feishu'
type Job = { id: string; type: JobType; ok: boolean; at: string; summary: string }
type AddJob = (j: Omit<Job, 'at'>) => void

const JOB_LABEL: Record<JobType, string> = {
  synthetic: '生成演示数据',
  synthetic_delete: '删除演示数据',
  csv_customers: 'CSV · 客户表',
  csv_events: 'CSV · 事件表',
  feishu: '飞书同步',
}

const TEMPLATES = {
  customers: { file: 'customers.csv', columns: ['external_id', 'name'], optional: [] as string[], sample: 'CUST-001,示例客户' },
  events: {
    file: 'events.csv',
    columns: ['external_customer_id', 'event_type', 'occurred_at'],
    optional: ['feature_key'],
    sample: 'CUST-001,install,2026-10-29T08:00:00Z,',
  },
}

function downloadTemplate(kind: keyof typeof TEMPLATES) {
  const t = TEMPLATES[kind]
  const header = [...t.columns, ...t.optional].join(',')
  const blob = new Blob([`﻿${header}\n${t.sample}\n`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = t.file
  a.click()
  URL.revokeObjectURL(url)
}

function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</code>
}

export function DataCenter() {
  // No imports-list endpoint in the API contract yet, so jobs are kept for this session only.
  const [jobs, setJobs] = useState<Job[]>([])
  const addJob: AddJob = (job) => setJobs((js) => [{ ...job, at: new Date().toISOString() }, ...js].slice(0, 20))

  return (
    <Page title="数据中心">
      <PageHeader title="数据中心" description="生成演示数据、上传 CSV，或从飞书只读同步客户与事件。" />

      <Tabs defaultValue="synthetic" className="grid gap-5">
        <TabsList>
          <TabsTrigger value="synthetic">
            <Sparkles />
            演示数据
          </TabsTrigger>
          <TabsTrigger value="csv">
            <FileText />
            CSV 上传
          </TabsTrigger>
          <TabsTrigger value="feishu">
            <Link2 />
            飞书同步
          </TabsTrigger>
        </TabsList>

        <TabsContent value="synthetic">
          <SyntheticPanel onJob={addJob} />
        </TabsContent>
        <TabsContent value="csv" className="grid gap-4 md:grid-cols-2">
          <UploadPanel kind="customers" title="客户表" onJob={addJob} />
          <UploadPanel kind="events" title="事件表" onJob={addJob} />
        </TabsContent>
        <TabsContent value="feishu">
          <FeishuPanel onJob={addJob} />
        </TabsContent>
      </Tabs>

      <Card className="mt-6 overflow-hidden">
        <CardHeader>
          <CardTitle>最近导入任务</CardTitle>
          <span className="text-xs text-mute">仅显示本次会话</span>
        </CardHeader>
        {jobs.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-mute">暂无导入记录。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>时间</TableHead>
                <TableHead>结果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id + j.at} className="animate-fade-in">
                  <TableCell className="text-foreground">{JOB_LABEL[j.type]}</TableCell>
                  <TableCell>{j.ok ? <Badge tone="gray">成功</Badge> : <Badge tone="churn">失败</Badge>}</TableCell>
                  <TableCell className="font-mono text-xs">{formatDateTime(j.at)}</TableCell>
                  <TableCell>{j.summary}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </Page>
  )
}

function SyntheticPanel({ onJob }: { onJob: AddJob }) {
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState<'generate' | 'delete' | null>(null)
  const [running, setRunning] = useState(false)

  async function run() {
    const action = confirm
    if (!action) return
    setRunning(true)
    try {
      if (action === 'generate') {
        const res = await generateSynthetic()
        toast.success(`已生成 ${res.customers} 位演示客户`, {
          action: { label: '查看总览', onClick: () => navigate('/overview') },
        })
        onJob({ id: res.import_id, type: 'synthetic', ok: true, summary: `共 ${res.customers} 位客户，新增事件 ${res.events_inserted ?? '—'} 条` })
      } else {
        const res = await deleteSynthetic()
        toast.success(`已删除 ${res.deleted_customers} 位演示客户`)
        onJob({ id: crypto.randomUUID(), type: 'synthetic_delete', ok: true, summary: `删除 ${res.deleted_customers} 位客户` })
      }
      setConfirm(null)
    } catch (err) {
      toast.error(errorMessage(err))
      onJob({ id: crypto.randomUUID(), type: action === 'generate' ? 'synthetic' : 'synthetic_delete', ok: false, summary: errorMessage(err) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-6 p-6">
        <div className="grid max-w-xl gap-2">
          <h2 className="heading text-base">演示数据</h2>
          <p className="text-[13px] leading-5 text-body">
            一键写入 80 位样例客户及其事件，覆盖安装 → 首次价值 → 复用 → 留存全链路，以及新客、风险、流失客户，并立即重算健康分与 PQL。
          </p>
          <p className="text-[13px] leading-5 text-body">
            生成与删除都只作用于来源为「演示数据」的客户，CSV 与飞书导入的客户保持不变。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirm('delete')}>
            <Trash2 />
            删除演示数据
          </Button>
          <Button onClick={() => setConfirm('generate')}>
            <Sparkles />
            生成演示数据
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirm !== null} onOpenChange={(o) => !running && !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === 'delete' ? '确认删除演示数据？' : '确认生成演示数据？'}</DialogTitle>
            <DialogDescription>
              {confirm === 'delete'
                ? '将删除当前租户全部演示客户及其事件与分数，此操作不可撤销。CSV 与飞书导入的客户不受影响。'
                : '将载入样例客户与事件；已存在的演示数据会被保留并去重。CSV 与飞书导入的客户不受影响。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={running}>
                取消
              </Button>
            </DialogClose>
            <Button variant={confirm === 'delete' ? 'destructive' : 'default'} loading={running} onClick={run}>
              {confirm === 'delete' ? '确认删除' : '确认生成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function UploadPanel({ kind, title, onJob }: { kind: 'customers' | 'events'; title: string; onJob: AddJob }) {
  const template = TEMPLATES[kind]
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<CsvUploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAllErrors, setShowAllErrors] = useState(false)

  async function upload(file: File) {
    setError(null)
    setResult(null)
    setShowAllErrors(false)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('请选择 .csv 文件')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('文件超过 2MB 上限')
      return
    }
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    const type = kind === 'customers' ? 'csv_customers' : 'csv_events'
    try {
      const res = await request<CsvUploadResult>(`/data/csv/${kind}`, { method: 'POST', body: form })
      setResult(res)
      const errs = res.errors.length
      onJob({ id: res.import_id, type, ok: true, summary: csvSummary(res) + (res.mocked ? '（模拟，未写入）' : '') })
      if (errs) toast.warning(`${file.name}：${errs} 行有误，其余已导入`)
      else toast.success(`${file.name} 导入完成，已重算评分`)
    } catch (err) {
      setError(errorMessage(err))
      onJob({ id: crypto.randomUUID(), type, ok: false, summary: errorMessage(err) })
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && !uploading) void upload(file)
  }

  const errors = result?.errors ?? []

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{title}</CardTitle>
          <Mono>{template.file}</Mono>
        </div>
        <Button variant="ghost" size="sm" onClick={() => downloadTemplate(kind)}>
          <Download />
          下载模板
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-body">
          必填列
          {template.columns.map((c) => (
            <Mono key={c}>{c}</Mono>
          ))}
          {template.optional.length > 0 && (
            <>
              <span className="ml-1">可选</span>
              {template.optional.map((c) => (
                <Mono key={c}>{c}</Mono>
              ))}
            </>
          )}
        </div>

        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          data-drag={dragging || undefined}
          className="grid justify-items-center gap-2 rounded-lg border border-dashed border-border-strong/60 bg-background px-5 py-8 text-center text-[13px] text-body transition-colors duration-150 hover:border-foreground/40 hover:bg-surface-2/60 disabled:cursor-wait disabled:opacity-60 data-[drag]:border-foreground/50 data-[drag]:bg-surface-2"
        >
          <Upload className="size-5 text-mute" />
          <span className="font-medium text-foreground">{uploading ? '正在导入…' : '点击选择或拖拽文件到此处'}</span>
          <span className="text-xs text-mute">UTF-8 编码，单个文件不超过 2MB</span>
        </button>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />

        {error && <ErrorBanner message={error} />}

        {result && (
          <div className="animate-fade-in grid gap-2 rounded-lg bg-surface-2 px-4 py-3 text-[13px]">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-body">
              <Stat label="新增" value={result.inserted} />
              {result.updated !== undefined && <Stat label="更新" value={result.updated} />}
              <Stat label="跳过（重复）" value={result.skipped} />
              <Stat label="有误" value={errors.length} danger={errors.length > 0} />
            </div>
            {result.mocked && <span className="text-xs text-mute">当前为模拟模式，仅做格式校验，未写入数据。</span>}
            {errors.length >= 50 && <span className="text-xs text-mute">错误较多，仅显示前 50 条。</span>}
            {errors.length > 0 && (
              <ul className="grid gap-1 font-mono text-xs text-destructive-deep">
                {(showAllErrors ? errors : errors.slice(0, 5)).map((e) => (
                  <li key={`${e.line}-${e.reason}`}>
                    第 {e.line} 行：{e.reason}
                  </li>
                ))}
                {errors.length > 5 && (
                  <li>
                    <button type="button" className="font-sans text-link hover:underline" onClick={() => setShowAllErrors((v) => !v)}>
                      {showAllErrors ? '收起' : `展开全部 ${errors.length} 条`}
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function csvSummary(r: CsvUploadResult) {
  const parts = [`新增 ${r.inserted}`]
  if (r.updated !== undefined) parts.push(`更新 ${r.updated}`)
  parts.push(`跳过 ${r.skipped}`)
  if (r.errors.length) parts.push(`${r.errors.length} 行有误`)
  return parts.join('，')
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <span>
      {label}{' '}
      <span className="num font-medium" style={{ color: danger ? 'var(--destructive)' : 'var(--foreground)' }}>
        {value}
      </span>
    </span>
  )
}

function FeishuPanel({ onJob }: { onJob: AddJob }) {
  // undefined = loading, null = not configured
  const [configured, setConfigured] = useState<boolean | undefined>(undefined)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FeishuSyncResult | null>(null)

  useEffect(() => {
    let cancelled = false
    getFeishuConfig()
      .then((c) => !cancelled && setConfigured(Boolean(c)))
      .catch(() => !cancelled && setConfigured(false))
    return () => {
      cancelled = true
    }
  }, [])

  async function sync() {
    setSyncing(true)
    setError(null)
    setResult(null)
    try {
      const res = await syncFeishu()
      setResult(res)
      toast.success(res.errors.length ? `飞书同步完成，${res.errors.length} 条有误` : '飞书同步完成，已重算评分')
      onJob({ id: res.import_id, type: 'feishu', ok: true, summary: syncSummary(res) })
    } catch (err) {
      setError(errorMessage(err))
      onJob({ id: crypto.randomUUID(), type: 'feishu', ok: false, summary: errorMessage(err) })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="grid max-w-xl gap-2">
            <h2 className="heading text-base">飞书多维表格只读同步</h2>
            <p className="text-[13px] leading-5 text-body">
              按字段映射拉取客户与事件，写入 <Mono>source=feishu</Mono>，不会回写飞书。凭证与字段映射在设置页配置。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/settings">{configured === false ? '去配置' : '查看配置'}</Link>
            </Button>
            <Button loading={syncing} disabled={!configured} onClick={sync}>
              立即同步
            </Button>
          </div>
        </div>
        {configured === false && (
          <p className="text-[13px] text-mute">尚未配置飞书凭证与表格，请先在设置页填写并保存。</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface-2 px-4 py-3 text-[13px] text-body">
          <span className="mr-1 font-mono text-xs text-mute">必填映射</span>
          客户 ID → <Mono>external_id</Mono>
          · 客户名称 → <Mono>name</Mono>
          · 事件类型 → <Mono>event_type</Mono>
          · 事件时间 → <Mono>occurred_at</Mono>
        </div>
        {error && <ErrorBanner message={error} />}
        {result && <FeishuSyncSummary result={result} />}
      </CardContent>
    </Card>
  )
}
