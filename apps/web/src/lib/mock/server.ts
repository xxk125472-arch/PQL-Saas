// In-browser stand-in for the FastAPI backend. Same paths, bodies and error
// `detail` strings as apps/api, so flipping the data source needs no UI changes.
// State lives in localStorage so a refresh keeps the demo tenant intact.

import customersCsv from '../../../../../data/sample/customers.csv?raw'
import eventsCsv from '../../../../../data/sample/events.csv?raw'
import type { CustomerDetail, CustomerList, CustomerListItem, Funnel, Me, Stage } from '../types'
import { parseCsvRecords } from './csv'
import { scoreCustomer, type MockCustomer, type MockEvent } from './engine'

type MockUser = { id: string; tenant_id: string; email: string | null; username: string | null; password_hash: string }
type MockImport = { id: string; type: string; status: 'success' | 'failed'; stats: Record<string, number>; created_at: string }
type Tenant = { id: string; name: string; customers: MockCustomer[]; events: MockEvent[]; imports: MockImport[] }
type Db = { users: MockUser[]; tenants: Record<string, Tenant> }

export class MockHttpError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : 'mock error')
    this.status = status
    this.detail = detail
  }
}

const DB_KEY = 'pql.mock.db'
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
const EVENT_TYPES = new Set(['install', 'first_value', 'reuse', 'retention_active', 'feature_use', 'other'])

const uid = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

function load(): Db {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch {
    // corrupted or unavailable — start fresh
  }
  return { users: [], tenants: {} }
}

function save(db: Db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    // quota / private mode: state stays in memory for this session
  }
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

function splitIdentifier(identifier: string): [string | null, string | null] {
  const id = identifier.trim()
  return id.includes('@') ? [id.toLowerCase(), null] : [null, id]
}

function authUser(db: Db, headers: Headers): MockUser {
  const token = headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new MockHttpError(401, 'Not authenticated')
  const userId = token.startsWith('mock.') ? token.slice(5) : null
  const user = db.users.find((u) => u.id === userId)
  if (!user) throw new MockHttpError(401, 'Invalid token')
  return user
}

/** Normalise "YYYY-MM-DD HH:mm:ss" (UTC) and ISO strings to ISO; null if unparseable. */
function parseTimestamp(value: string): string | null {
  const v = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value) ? `${value.replace(' ', 'T')}Z` : value
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/* ---------- Scoring views ---------- */

function scoredCustomers(t: Tenant) {
  const byCustomer = new Map<string, MockEvent[]>()
  for (const e of t.events) {
    const list = byCustomer.get(e.customer_id)
    if (list) list.push(e)
    else byCustomer.set(e.customer_id, [e])
  }
  return t.customers.map((c) => {
    const events = byCustomer.get(c.id) ?? []
    return { customer: c, events, score: scoreCustomer(events) }
  })
}

function funnel(t: Tenant): Funnel {
  const ever = (type: string) => new Set(t.events.filter((e) => e.event_type === type).map((e) => e.customer_id)).size
  const scored = scoredCustomers(t)
  const countStage = (s: Stage) => scored.filter((x) => x.score.stage === s).length
  const installed = ever('install')
  const first_value = ever('first_value')
  const reuse = ever('reuse')
  const retention = countStage('retention')
  const rate = (a: number, b: number) => (a === 0 ? null : Math.round((b / a) * 10000) / 10000)
  return {
    installed,
    first_value,
    reuse,
    retention,
    customer_total: t.customers.length,
    pql_count: scored.filter((x) => x.score.is_pql).length,
    at_risk_count: countStage('at_risk'),
    churned_count: countStage('churned'),
    conversion_rates: {
      installed_to_first_value: rate(installed, first_value),
      first_value_to_reuse: rate(first_value, reuse),
      reuse_to_retention: rate(reuse, retention),
    },
  }
}

function listCustomers(t: Tenant, q: URLSearchParams): CustomerList {
  const page = Math.max(1, Number(q.get('page') ?? 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(q.get('page_size') ?? 20) || 20))
  const stage = q.get('stage')
  const isPql = q.get('is_pql')
  const term = q.get('q')?.trim().toLowerCase()

  let rows = scoredCustomers(t)
  if (stage) rows = rows.filter((r) => r.score.stage === stage)
  if (term) rows = rows.filter((r) => r.customer.name.toLowerCase().includes(term) || r.customer.external_id.toLowerCase().includes(term))
  if (isPql === 'true') rows = rows.filter((r) => r.score.is_pql)
  if (isPql === 'false') rows = rows.filter((r) => !r.score.is_pql)

  rows.sort((a, b) => {
    const la = a.score.last_active_at
    const lb = b.score.last_active_at
    if (la !== lb) {
      if (!la) return 1
      if (!lb) return -1
      return lb.localeCompare(la)
    }
    return b.customer.created_at.localeCompare(a.customer.created_at)
  })

  const items: CustomerListItem[] = rows.slice((page - 1) * pageSize, page * pageSize).map(({ customer: c, score: s }) => ({
    id: c.id,
    external_id: c.external_id,
    name: c.name,
    stage: s.stage,
    health_score: s.health_score,
    pql_score: s.pql_score,
    is_pql: s.is_pql,
    suggested_action: s.suggested_action,
    last_active_at: s.last_active_at,
    score_stale: false,
  }))
  return { items, total: rows.length, page, page_size: pageSize }
}

function customerDetail(t: Tenant, id: string): CustomerDetail {
  const row = scoredCustomers(t).find((r) => r.customer.id === id)
  if (!row) throw new MockHttpError(404, 'customer not found')
  const { customer: c, events, score: s } = row
  return {
    id: c.id,
    external_id: c.external_id,
    name: c.name,
    stage: s.stage,
    source: c.source,
    last_active_at: s.last_active_at,
    score: {
      health_score: s.health_score,
      pql_score: s.pql_score,
      is_pql: s.is_pql,
      health_breakdown: s.health_breakdown,
      pql_breakdown: s.pql_breakdown,
      suggested_action: s.suggested_action,
      action_reason: s.action_reason,
      calculated_at: nowIso(),
    },
    events: [...events].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 50),
  }
}

/* ---------- Imports ---------- */

type RowError = { line: number; reason: string }

function importCustomers(t: Tenant, text: string, source: MockCustomer['source']) {
  const { header, records } = parseCsvRecords(text)
  const errors: RowError[] = []
  if (!header.includes('external_id') || !header.includes('name')) {
    return { inserted: 0, updated: 0, errors: [{ line: 1, reason: '表头必须包含 external_id,name' }] }
  }
  const seen = new Set<string>()
  let inserted = 0
  let updated = 0
  for (const { line, values } of records) {
    const ext = values.external_id
    const name = values.name
    if (!ext) {
      errors.push({ line, reason: 'external_id 为空' })
      continue
    }
    if (!name) {
      errors.push({ line, reason: 'name 为空' })
      continue
    }
    if (seen.has(ext)) {
      errors.push({ line, reason: `external_id 重复：${ext}` })
      continue
    }
    seen.add(ext)
    const existing = t.customers.find((c) => c.external_id === ext)
    if (existing) {
      existing.name = name
      updated++
    } else {
      t.customers.push({ id: uid(), external_id: ext, name, source, created_at: nowIso() })
      inserted++
    }
  }
  return { inserted, updated, errors }
}

function importEvents(t: Tenant, text: string) {
  const { header, records } = parseCsvRecords(text)
  const required = ['external_customer_id', 'event_type', 'occurred_at']
  const missing = required.filter((h) => !header.includes(h))
  if (missing.length) return { inserted: 0, skipped: 0, errors: [{ line: 1, reason: `表头缺少：${missing.join(', ')}` }] }

  const byExt = new Map(t.customers.map((c) => [c.external_id, c.id]))
  const keys = new Set(t.events.map((e) => `${e.customer_id}|${e.event_type}|${e.occurred_at}`))
  const errors: RowError[] = []
  let inserted = 0
  let skipped = 0
  for (const { line, values } of records) {
    const customerId = byExt.get(values.external_customer_id)
    if (!customerId) {
      errors.push({ line, reason: `找不到客户：${values.external_customer_id || '（空）'}` })
      continue
    }
    if (!EVENT_TYPES.has(values.event_type)) {
      errors.push({ line, reason: `未知事件类型：${values.event_type || '（空）'}` })
      continue
    }
    const at = parseTimestamp(values.occurred_at)
    if (!at) {
      errors.push({ line, reason: `时间格式无效：${values.occurred_at || '（空）'}` })
      continue
    }
    const key = `${customerId}|${values.event_type}|${at}`
    if (keys.has(key)) {
      skipped++
      continue
    }
    keys.add(key)
    t.events.push({ id: uid(), customer_id: customerId, event_type: values.event_type, feature_key: values.feature_key || null, occurred_at: at })
    inserted++
  }
  return { inserted, skipped, errors }
}

/** Replace only `source=synthetic` customers with the shared data/sample set (PRD §6.4). */
function seedSynthetic(t: Tenant) {
  const syntheticIds = new Set(t.customers.filter((c) => c.source === 'synthetic').map((c) => c.id))
  t.customers = t.customers.filter((c) => !syntheticIds.has(c.id))
  t.events = t.events.filter((e) => !syntheticIds.has(e.customer_id))
  const kept = new Set(t.customers.map((c) => c.external_id))

  // Skip sample IDs a CSV/Feishu import already owns, so those customers are never touched.
  const toCsv = (parsed: ReturnType<typeof parseCsvRecords>, idField: string) =>
    [
      parsed.header.join(','),
      ...parsed.records.filter((r) => !kept.has(r.values[idField])).map((r) => parsed.header.map((h) => r.values[h]).join(',')),
    ].join('\n')

  const before = t.customers.length
  importCustomers(t, toCsv(parseCsvRecords(customersCsv), 'external_id'), 'synthetic')
  importEvents(t, toCsv(parseCsvRecords(eventsCsv), 'external_customer_id'))
  return t.customers.length - before
}

function recordImport(t: Tenant, type: string, stats: Record<string, number>, failed: boolean) {
  const job: MockImport = { id: uid(), type, status: failed ? 'failed' : 'success', stats, created_at: nowIso() }
  t.imports.unshift(job)
  t.imports = t.imports.slice(0, 20)
  return job
}

async function readUpload(body: unknown): Promise<string> {
  const file = body instanceof FormData ? body.get('file') : null
  if (!(file instanceof File)) throw new MockHttpError(422, [{ loc: ['body', 'file'], msg: 'Field required' }])
  if (file.size > MAX_UPLOAD_BYTES) throw new MockHttpError(413, 'file too large')
  return file.text()
}

/* ---------- Router ---------- */

export async function mockFetch(path: string, method: string, headers: Headers, body: unknown): Promise<unknown> {
  // Simulated network latency so loading states are visible in demos.
  await new Promise((r) => setTimeout(r, 180 + Math.random() * 220))
  const db = load()
  const url = new URL(path, 'http://mock.local')
  const route = `${method} ${url.pathname}`

  if (route === 'POST /auth/register' || route === 'POST /auth/login') {
    const { identifier = '', password = '' } = (body ?? {}) as { identifier?: string; password?: string }
    const [email, username] = splitIdentifier(identifier)
    if (!email && !username) throw new MockHttpError(400, 'identifier required')
    const hash = await sha256(password)
    if (route === 'POST /auth/login') {
      const user = db.users.find((u) => (email ? u.email === email : u.username === username))
      if (!user || user.password_hash !== hash) throw new MockHttpError(401, 'invalid credentials')
      return { access_token: `mock.${user.id}`, token_type: 'bearer' }
    }
    if (password.length < 6) throw new MockHttpError(422, [{ loc: ['body', 'password'], msg: 'String should have at least 6 characters' }])
    if (email && db.users.some((u) => u.email === email)) throw new MockHttpError(400, 'email already registered')
    if (username && db.users.some((u) => u.username === username)) throw new MockHttpError(400, 'username already registered')
    const tenantId = uid()
    const user: MockUser = { id: uid(), tenant_id: tenantId, email, username, password_hash: hash }
    db.users.push(user)
    db.tenants[tenantId] = { id: tenantId, name: `${username ?? email}的租户`, customers: [], events: [], imports: [] }
    save(db)
    return { access_token: `mock.${user.id}`, token_type: 'bearer' }
  }

  const user = authUser(db, headers)
  const tenant = db.tenants[user.tenant_id]
  if (!tenant) throw new MockHttpError(401, 'User not found')

  if (route === 'POST /auth/logout') return { ok: true, user_id: user.id }
  if (route === 'GET /me') {
    const me: Me = { id: user.id, tenant_id: user.tenant_id, email: user.email, username: user.username, tenant_name: tenant.name }
    return me
  }
  if (route === 'GET /overview/funnel') return funnel(tenant)
  if (route === 'GET /customers') return listCustomers(tenant, url.searchParams)
  if (method === 'GET' && url.pathname.startsWith('/customers/')) {
    return customerDetail(tenant, decodeURIComponent(url.pathname.slice('/customers/'.length)))
  }

  if (route === 'POST /data/synthetic') {
    const customers = seedSynthetic(tenant)
    const job = recordImport(tenant, 'synthetic', { customers }, false)
    save(db)
    return { ok: true, import_id: job.id, customers }
  }
  if (route === 'POST /data/csv/customers' || route === 'POST /data/csv/events') {
    const text = await readUpload(body)
    const isCustomers = route.endsWith('customers')
    const result = isCustomers ? importCustomers(tenant, text, 'csv') : importEvents(tenant, text)
    const { errors, ...stats } = result
    const job = recordImport(tenant, isCustomers ? 'csv_customers' : 'csv_events', { ...stats, errors: errors.length }, false)
    save(db)
    return { ok: true, import_id: job.id, ...stats, errors }
  }
  if (route === 'POST /integrations/feishu/sync') throw new MockHttpError(400, 'feishu credentials missing')

  throw new MockHttpError(404, 'Not Found')
}
