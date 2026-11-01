import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Download, FileText, Link2, Sparkles, Upload } from 'lucide-react'
import { Page, PageHeader } from '@/layout/AppShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ErrorBanner } from '@/components/EmptyState'
import { errorMessage, request } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { generateSynthetic } from '@/lib/synthetic'
import type { UploadResult } from '@/lib/types'

const MAX_BYTES = 2 * 1024 * 1024

type JobType = 'synthetic' | 'csv_customers' | 'csv_events' | 'feishu'
type Job = { id: string; type: JobType; ok: boolean; at: string; summary: string }

const JOB_LABEL: Record<JobType, string> = {
  synthetic: '合成数据',
  csv_customers: 'CSV · 客户',
  csv_events: 'CSV · 事件',
  feishu: '飞书同步',
}

const TEMPLATES = {
  customers: { file: 'customers.csv', header: 'external_id,name', sample: 'CUST-001,示例客户' },
  events: {
    file: 'events.csv',
    header: 'external_customer_id,event_type,occurred_at,feature_key',
    sample: 'CUST-001,install,2026-10-29T08:00:00Z,',
  },
} as const

function downloadTemplate(kind: keyof typeof TEMPLATES) {
  const t = TEMPLATES[kind]
  const blob = new Blob([`﻿${t.header}\n${t.sample}\n`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = t.file
  a.click()
  URL.revokeObjectURL(url)
}

export function DataCenter() {
  // No imports-list endpoint yet (API contract), so recent jobs are kept for this session only.
  const [jobs, setJobs] = useState<Job[]>([])
  const addJob = (job: Omit<Job, 'at'>) => setJobs((js) => [{ ...job, at: new Date().toISOString() }, ...js].slice(0, 20))

  return (
    <Page>
      <PageHeader title="数据中心" description="生成演示数据、上传 CSV，或从飞书只读同步客户与事件。" />

      <Tabs defaultValue="synthetic" className="grid gap-5">
        <TabsList>
          <TabsTrigger value="synthetic">
            <Sparkles />
            合成数据
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
          <UploadPanel kind="customers" title="客户 customers.csv" desc="必填列：external_id, name" onJob={addJob} />
          <UploadPanel kind="events" title="事件 events.csv" desc="必填列：external_customer_id, event_type, occurred_at；可选 feature_key" onJob={addJob} />
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
                  <TableCell>{j.ok ? <Badge tone="mint">成功</Badge> : <Badge tone="red">失败</Badge>}</TableCell>
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

function SyntheticPanel({ onJob }: { onJob: (j: Omit<Job, 'at'>) => void }) {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)

  async function run() {
    setRunning(true)
    try {
      const res = await generateSynthetic()
      toast.success(`已生成 ${res.customers} 位演示客户`, {
        action: { label: '查看总览', onClick: () => window.location.assign('/overview') },
      })
      onJob({ id: res.import_id, type: 'synthetic', ok: true, summary: `写入 ${res.customers} 位客户` })
      setOpen(false)
    } catch (err) {
      toast.error(errorMessage(err))
      onJob({ id: crypto.randomUUID(), type: 'synthetic', ok: false, summary: errorMessage(err) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-6 p-6">
        <div className="grid max-w-xl gap-2">
          <h2 className="heading text-base">生成演示数据</h2>
          <p className="text-[13px] leading-5 text-body">
            一键写入 80 位样例客户及其事件，覆盖安装 → 首次价值 → 复用 → 留存全链路，以及新客、风险、流失客户，并立即重算健康分与 PQL。
          </p>
          <p className="text-[13px] leading-5 text-body">
            再次生成只会替换 <span className="font-mono text-xs">source=synthetic</span> 的数据，CSV 与飞书导入的客户保持不变。
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Sparkles />
          生成演示数据
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => !running && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认生成演示数据？</DialogTitle>
            <DialogDescription>将替换当前租户中已有的演示数据（source=synthetic），CSV 与飞书导入的客户不受影响。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={running}>
                取消
              </Button>
            </DialogClose>
            <Button loading={running} onClick={run}>
              确认生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function UploadPanel({
  kind,
  title,
  desc,
  onJob,
}: {
  kind: 'customers' | 'events'
  title: string
  desc: string
  onJob: (j: Omit<Job, 'at'>) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
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
      const res = await request<UploadResult>(`/data/csv/${kind}`, { method: 'POST', body: form })
      setResult(res)
      const errs = res.errors?.length ?? 0
      const summary =
        res.inserted !== undefined
          ? `新增 ${res.inserted} 行${res.updated ? `，更新 ${res.updated} 行` : ''}${res.skipped ? `，跳过重复 ${res.skipped} 行` : ''}${errs ? `，${errs} 行出错` : ''}`
          : '文件已接收，后端解析开发中'
      onJob({ id: res.import_id, type, ok: true, summary })
      if (errs) toast.warning(`${file.name}：${errs} 行未导入，请查看错误明细`)
      else toast.success(`${file.name} 导入完成`)
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
        <div className="grid gap-0.5">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{desc}</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => downloadTemplate(kind)}>
          <Download />
          下载模板
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3">
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
          <span className="font-medium text-foreground">{uploading ? '正在上传…' : '点击选择或拖拽文件到此处'}</span>
          <span className="text-xs text-mute">UTF-8 编码，单个文件不超过 2MB</span>
        </button>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />

        {error && <ErrorBanner message={error} />}

        {result && (
          <div className="animate-fade-in grid gap-2 rounded-lg bg-surface-2 px-4 py-3 text-[13px]">
            {result.inserted !== undefined ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-body">
                <span>
                  新增 <span className="num font-medium text-foreground">{result.inserted}</span>
                </span>
                {result.updated !== undefined && (
                  <span>
                    更新 <span className="num font-medium text-foreground">{result.updated}</span>
                  </span>
                )}
                {result.skipped !== undefined && (
                  <span>
                    重复跳过 <span className="num font-medium text-foreground">{result.skipped}</span>
                  </span>
                )}
                <span>
                  出错 <span className="num font-medium" style={{ color: errors.length ? 'var(--destructive)' : undefined }}>{errors.length}</span>
                </span>
              </div>
            ) : (
              <span className="text-body">文件已接收，后端解析功能开发中。</span>
            )}
            {errors.length > 0 && (
              <ul className="grid gap-1 font-mono text-xs text-destructive-deep">
                {(showAllErrors ? errors : errors.slice(0, 5)).map((e) => (
                  <li key={e.line}>
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

function FeishuPanel({ onJob }: { onJob: (j: Omit<Job, 'at'>) => void }) {
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sync() {
    setSyncing(true)
    setError(null)
    try {
      await request('/integrations/feishu/sync', { method: 'POST' })
      toast.success('飞书同步完成')
      onJob({ id: crypto.randomUUID(), type: 'feishu', ok: true, summary: '同步完成' })
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
            <h2 className="heading text-base">飞书表格 / 多维表格只读同步</h2>
            <p className="text-[13px] leading-5 text-body">
              按字段映射拉取客户与事件，写入 <span className="font-mono text-xs">source=feishu</span>，不会回写飞书。凭证与字段映射在设置页配置。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/settings">去配置</Link>
            </Button>
            <Button loading={syncing} onClick={sync}>
              立即同步
            </Button>
          </div>
        </div>
        <div className="grid gap-1.5 rounded-lg bg-surface-2 px-4 py-3 text-[13px] text-body">
          <span className="font-mono text-xs text-mute">必填映射</span>
          客户 ID → external_id · 客户名称 → name · 事件类型 → event_type · 事件时间 → occurred_at
        </div>
        {error && <ErrorBanner message={error} />}
      </CardContent>
    </Card>
  )
}
