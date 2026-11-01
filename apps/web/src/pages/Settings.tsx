import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { ChevronRight } from 'lucide-react'
import { Page, PageHeader } from '@/layout/AppShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorBanner } from '@/components/EmptyState'
import { FeishuSyncSummary } from '@/components/FeishuSyncSummary'
import { ApiError, errorMessage } from '@/lib/api'
import { EVENT_TYPES } from '@/lib/dictionary'
import { DEFAULT_FIELD_MAPPING, getFeishuConfig, hasSecret, maskedSecret, saveFeishuConfig, syncFeishu, testFeishu } from '@/lib/feishu'
import type { FeishuConfig, FeishuConfigUpdate, FeishuFieldMapping, FeishuSyncResult } from '@/lib/types'
import { cn } from '@/lib/utils'

export function Settings() {
  return (
    <Page title="设置">
      <PageHeader title="设置" description="集成与数据源配置。" />
      <div className="grid max-w-3xl gap-4">
        <FeishuCard />
      </div>
    </Page>
  )
}

// ---------------------------------------------------------------------------

type Form = {
  app_id: string
  app_token: string
  customers_table_id: string
  events_table_id: string
  mapping: Record<Exclude<keyof FeishuFieldMapping, 'event_type_values'>, string>
  /** event_type_values as editable lines: `飞书取值=标准事件类型` */
  values_text: string
}

type Conn = 'unconfigured' | 'checking' | 'connected' | 'failed' | 'idle'

const MAPPING_FIELDS: Array<{ key: keyof Form['mapping']; label: string; optional?: boolean }> = [
  { key: 'external_id', label: '客户表 · 客户 ID 列' },
  { key: 'name', label: '客户表 · 客户名称列' },
  { key: 'external_customer_id', label: '事件表 · 客户 ID 列' },
  { key: 'event_type', label: '事件表 · 事件类型列' },
  { key: 'occurred_at', label: '事件表 · 事件时间列' },
  { key: 'feature_key', label: '事件表 · 功能列', optional: true },
]

function toForm(c: FeishuConfig | null): Form {
  const m = { ...DEFAULT_FIELD_MAPPING, ...(c?.field_mapping ?? {}) }
  return {
    app_id: c?.app_id ?? '',
    app_token: c?.app_token ?? '',
    customers_table_id: c?.customers_table_id ?? '',
    events_table_id: c?.events_table_id ?? '',
    mapping: {
      external_id: m.external_id ?? '',
      name: m.name ?? '',
      external_customer_id: m.external_customer_id ?? '',
      event_type: m.event_type ?? '',
      occurred_at: m.occurred_at ?? '',
      feature_key: m.feature_key ?? '',
    },
    values_text: Object.entries(m.event_type_values ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
  }
}

function parseValues(text: string): { values: Record<string, string>; error: string | null } {
  const values: Record<string, string> = {}
  for (const [i, raw] of text.split('\n').entries()) {
    const line = raw.trim()
    if (!line) continue
    const at = line.search(/[=＝]/)
    if (at <= 0) return { values, error: `第 ${i + 1} 行格式应为「飞书取值=事件类型」` }
    const from = line.slice(0, at).trim()
    const to = line.slice(at + 1).trim()
    if (!(to in EVENT_TYPES)) return { values, error: `第 ${i + 1} 行：未知事件类型 ${to || '（空）'}` }
    values[from] = to
  }
  return { values, error: null }
}

function FeishuCard() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [config, setConfig] = useState<FeishuConfig | null>(null)
  const [form, setForm] = useState<Form>(() => toForm(null))
  const [baseline, setBaseline] = useState<string>(() => JSON.stringify(toForm(null)))
  const [secretEditing, setSecretEditing] = useState(false)
  const [secret, setSecret] = useState('')
  const [advanced, setAdvanced] = useState(false)

  const [conn, setConn] = useState<Conn>('unconfigured')
  const [connMsg, setConnMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<FeishuSyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const secretRef = useRef<HTMLInputElement>(null)

  const fromEnv = config?.source === 'env'
  const persisted = Boolean(config)
  const hasStoredSecret = hasSecret(config?.app_secret_masked)
  const dirty = JSON.stringify(form) !== baseline || (secretEditing && secret.length > 0)

  const runTest = useCallback(async (quiet = false) => {
    setTesting(true)
    setConn('checking')
    try {
      const res = await testFeishu()
      setConn('connected')
      setConnMsg(`已连接，读取 ${res.records_read} 条`)
      if (!quiet) toast.success(`飞书已连接，读取 ${res.records_read} 条`)
    } catch (err) {
      setConn('failed')
      setConnMsg(errorMessage(err))
    } finally {
      setTesting(false)
    }
  }, [])

  const apply = useCallback((c: FeishuConfig | null) => {
    setConfig(c)
    const f = toForm(c)
    setForm(f)
    setBaseline(JSON.stringify(f))
    setSecret('')
    setSecretEditing(!hasSecret(c?.app_secret_masked))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const c = await getFeishuConfig()
      apply(c)
      if (c) void runTest(true)
      else {
        setConn('unconfigured')
        setConnMsg(null)
      }
    } catch (err) {
      if (err instanceof ApiError && (err.code ?? '').startsWith('FEISHU_')) {
        // A stored config the backend can't use (e.g. undecryptable secret): keep the form
        // usable so it can be re-saved, and say why in Chinese.
        apply(null)
        setConn('failed')
        setConnMsg(null)
        setFormError(err.message)
      } else {
        setLoadError(errorMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }, [apply, runTest])

  useEffect(() => {
    void load()
  }, [load])

  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }))
    setFormError(null)
  }
  const setMap = (key: keyof Form['mapping'], value: string) => set({ mapping: { ...form.mapping, [key]: value } })

  async function save() {
    setFormError(null)
    const required: Array<[string, string]> = [
      ['App ID', form.app_id],
      ['app_token', form.app_token],
      ['客户表 ID', form.customers_table_id],
      ['事件表 ID', form.events_table_id],
      ...MAPPING_FIELDS.filter((f) => !f.optional && f.key !== 'external_customer_id').map((f) => [f.label, form.mapping[f.key]] as [string, string]),
    ]
    const missing = required.filter(([, v]) => !v.trim()).map(([k]) => k)
    if (missing.length) {
      if (missing.some((m) => m.includes('列'))) setAdvanced(true)
      setFormError(`请填写：${missing.join('、')}`)
      return
    }
    // A secret read from the local .env is not in the DB yet, so saving must supply one.
    const needSecret = !hasStoredSecret || fromEnv
    if (needSecret && !secret.trim()) {
      setSecretEditing(true)
      setFormError(fromEnv ? '保存到本机需要重新填写 App Secret（当前 Secret 来自本地配置）' : '请填写 App Secret')
      window.setTimeout(() => secretRef.current?.focus(), 0)
      return
    }
    const { values, error } = parseValues(form.values_text)
    if (error) {
      setAdvanced(true)
      setFormError(`事件类型取值映射 ${error}`)
      return
    }
    const body: FeishuConfigUpdate = {
      app_id: form.app_id.trim(),
      app_token: form.app_token.trim(),
      customers_table_id: form.customers_table_id.trim(),
      events_table_id: form.events_table_id.trim(),
      field_mapping: {
        ...form.mapping,
        external_customer_id: form.mapping.external_customer_id.trim() || null,
        feature_key: form.mapping.feature_key.trim() || null,
        event_type_values: values,
      },
    }
    // Only a secret the user actually typed is sent; omitting app_secret keeps the stored one
    // (PUT contract). A pasted-back mask (`****…`) is never sent.
    const typed = secret.trim()
    if (secretEditing && typed && !typed.startsWith('****')) body.app_secret = typed
    else if (needSecret) {
      setSecretEditing(true)
      setFormError('请填写完整的 App Secret')
      return
    }
    setSaving(true)
    try {
      const saved = await saveFeishuConfig(body)
      apply({ ...saved, source: saved.source ?? 'database' })
      toast.success('飞书配置已保存')
      setSyncResult(null)
      void runTest(true)
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function sync() {
    setSyncing(true)
    setSyncError(null)
    setSyncResult(null)
    try {
      const res = await syncFeishu()
      setSyncResult(res)
      setConn('connected')
      toast.success(res.errors.length ? `同步完成，${res.errors.length} 条有误` : '同步完成，已重算评分')
    } catch (err) {
      setSyncError(errorMessage(err))
    } finally {
      setSyncing(false)
    }
  }

  const envTag = fromEnv ? <EnvTag /> : null

  return (
    <Card>
      <CardHeader>
        <div className="grid gap-0.5">
          <CardTitle>飞书多维表格</CardTitle>
          <span className="text-xs text-mute">只读拉取客户表与事件表，写入后自动重算评分。</span>
        </div>
        <ConnBadge conn={loading ? 'checking' : conn} />
      </CardHeader>

      {loading ? (
        <CardContent className="grid gap-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </CardContent>
      ) : loadError ? (
        <CardContent>
          <ErrorBanner message={loadError} onRetry={() => void load()} />
        </CardContent>
      ) : (
        <CardContent className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="App ID" htmlFor="fs-app-id" tag={envTag}>
              <Input id="fs-app-id" className="font-mono text-[13px]" placeholder="cli_xxxxxxxx" autoComplete="off" value={form.app_id} onChange={(e) => set({ app_id: e.target.value })} />
            </Field>

            <Field label="App Secret" htmlFor="fs-secret" tag={envTag}>
              {hasStoredSecret && !secretEditing ? (
                <div className="flex h-10 items-center gap-3 rounded-md bg-surface-2 px-3">
                  <span className="font-mono text-[13px] tracking-wider text-foreground">{maskedSecret(config?.app_secret_masked)}</span>
                  <button
                    type="button"
                    className="ml-auto text-[13px] font-medium text-link underline-offset-4 hover:underline"
                    onClick={() => {
                      setSecretEditing(true)
                      window.setTimeout(() => secretRef.current?.focus(), 0)
                    }}
                  >
                    更换
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    ref={secretRef}
                    id="fs-secret"
                    type="password"
                    autoComplete="new-password"
                    placeholder={hasStoredSecret ? '输入新的 App Secret' : '飞书应用的 App Secret'}
                    value={secret}
                    onChange={(e) => {
                      setSecret(e.target.value)
                      setFormError(null)
                    }}
                  />
                  {hasStoredSecret && (
                    <button
                      type="button"
                      className="shrink-0 text-[13px] text-body underline-offset-4 hover:text-foreground hover:underline"
                      onClick={() => {
                        setSecretEditing(false)
                        setSecret('')
                      }}
                    >
                      取消
                    </button>
                  )}
                </div>
              )}
            </Field>

            <Field label="app_token" htmlFor="fs-app-token" tag={envTag} hint="多维表格链接中 /base/ 后面的一段">
              <Input id="fs-app-token" className="font-mono text-[13px]" autoComplete="off" value={form.app_token} onChange={(e) => set({ app_token: e.target.value })} />
            </Field>
            <div className="hidden sm:block" />

            <Field label="客户表 ID" htmlFor="fs-cust" tag={envTag}>
              <Input id="fs-cust" className="font-mono text-[13px]" placeholder="tblxxxxxxxx" autoComplete="off" value={form.customers_table_id} onChange={(e) => set({ customers_table_id: e.target.value })} />
            </Field>
            <Field label="事件表 ID" htmlFor="fs-events" tag={envTag}>
              <Input id="fs-events" className="font-mono text-[13px]" placeholder="tblxxxxxxxx" autoComplete="off" value={form.events_table_id} onChange={(e) => set({ events_table_id: e.target.value })} />
            </Field>
          </div>

          <div className="rounded-lg shadow-l1">
            <button
              type="button"
              aria-expanded={advanced}
              onClick={() => setAdvanced((v) => !v)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-medium text-foreground"
            >
              <ChevronRight className={cn('size-4 text-mute transition-transform duration-150', advanced && 'rotate-90')} />
              高级设置
              <span className="font-normal text-mute">字段映射（默认按模板列名）</span>
            </button>
            {advanced && (
              <div className="animate-fade-in grid gap-4 border-t border-border px-4 pt-4 pb-4 sm:grid-cols-2">
                {MAPPING_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label + (f.optional ? '（可选）' : '')} htmlFor={`fs-map-${f.key}`}>
                    <Input
                      id={`fs-map-${f.key}`}
                      className="h-8 font-mono text-[13px]"
                      placeholder={DEFAULT_FIELD_MAPPING[f.key] ?? ''}
                      value={form.mapping[f.key]}
                      onChange={(e) => setMap(f.key, e.target.value)}
                    />
                  </Field>
                ))}
                <div className="sm:col-span-2">
                  <Field label="事件类型取值映射（可选）" htmlFor="fs-values" hint="飞书里的取值与标准事件类型不同时填写，每行一条，如「安装=install」">
                    <textarea
                      id="fs-values"
                      rows={3}
                      className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 font-mono text-[13px] text-foreground outline-none placeholder:text-mute hover:border-border-strong/60 focus-visible:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring"
                      placeholder={'安装=install\n首次价值=first_value'}
                      value={form.values_text}
                      onChange={(e) => set({ values_text: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>

          {formError && <ErrorBanner message={formError} />}

          {connMsg && conn !== 'checking' && (
            <p className={cn('animate-fade-in text-[13px]', conn === 'failed' ? 'text-destructive-deep' : 'text-body')} role="status">
              {conn === 'failed' ? `连接失败：${connMsg}` : connMsg}
            </p>
          )}

          {syncError && <ErrorBanner message={`同步失败：${syncError}`} />}
          {syncResult && <FeishuSyncSummary result={syncResult} />}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {dirty && persisted && <span className="mr-auto text-xs text-mute">有未保存的修改；测试与同步使用已保存的配置。</span>}
            <Button variant="outline" loading={testing} disabled={!persisted || saving} onClick={() => void runTest()}>
              测试连接
            </Button>
            <Button variant="outline" loading={syncing} disabled={!persisted || dirty || saving} onClick={sync} title={!persisted || dirty ? '请先保存配置' : undefined}>
              立即同步
            </Button>
            <Button loading={saving} onClick={save}>
              保存
            </Button>
          </div>

          <p className="text-xs text-mute">凭证仅保存在本机，加密存储</p>
        </CardContent>
      )}
    </Card>
  )
}

function ConnBadge({ conn }: { conn: Conn }) {
  switch (conn) {
    case 'connected':
      return (
        <Badge tone="gray" className="text-foreground">
          <span className="size-1.5 rounded-full bg-foreground" />
          已连接
        </Badge>
      )
    case 'failed':
      return <Badge tone="churn">连接失败</Badge>
    case 'checking':
      return <Badge tone="gray">检测中…</Badge>
    case 'idle':
      return <Badge tone="gray">已配置</Badge>
    default:
      return <Badge tone="gray">未配置</Badge>
  }
}

function EnvTag() {
  return <span className="rounded-sm bg-surface-2 px-1.5 py-px font-mono text-[11px] text-body">来自本地配置</span>
}

function Field({ label, htmlFor, tag, hint, children }: { label: string; htmlFor?: string; tag?: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={htmlFor} className="text-xs font-normal text-body">
          {label}
        </Label>
        {tag}
      </div>
      {children}
      {hint && <span className="text-xs text-mute">{hint}</span>}
    </div>
  )
}
