// In-browser stand-in for backend slices that are not live yet (see ../backend.ts).
// Handlers are stateless: nothing is written, so mock results never mix with real tenant data.
// Error `detail` strings mirror apps/api so the Chinese mapping in api.ts applies unchanged.

import { parseCsvRecords } from './csv'

export class MockHttpError extends Error {
  status: number
  detail: unknown
  code?: string
  constructor(status: number, detail: unknown, code?: string) {
    super(typeof detail === 'string' ? detail : 'mock error')
    this.status = status
    this.detail = detail
    this.code = code
  }
}

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
const EVENT_TYPES = new Set(['install', 'first_value', 'reuse', 'retention_active', 'feature_use', 'other'])
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/

type RowError = { line: number; reason: string }

async function readUpload(body: unknown): Promise<string> {
  const file = body instanceof FormData ? body.get('file') : null
  if (!(file instanceof File)) throw new MockHttpError(422, [{ loc: ['body', 'file'], msg: 'Field required' }])
  if (file.size > MAX_UPLOAD_BYTES) throw new MockHttpError(413, 'file too large')
  return file.text()
}

/** Row-level checks only (customer existence needs the backend). */
function validateCsv(kind: 'customers' | 'events', text: string) {
  const { header, records } = parseCsvRecords(text)
  const required = kind === 'customers' ? ['external_id', 'name'] : ['external_customer_id', 'event_type', 'occurred_at']
  const missing = required.filter((h) => !header.includes(h))
  if (missing.length) throw new MockHttpError(400, `缺少必填列：${missing.join('、')}`, 'CSV_MISSING_COLUMNS')

  const errors: RowError[] = []
  const seen = new Set<string>()
  for (const { line, values } of records) {
    const empty = required.find((h) => !values[h])
    if (empty) {
      errors.push({ line, reason: `${empty} 为空` })
    } else if (kind === 'customers') {
      if (seen.has(values.external_id)) errors.push({ line, reason: `external_id 重复：${values.external_id}` })
      seen.add(values.external_id)
    } else if (!EVENT_TYPES.has(values.event_type)) {
      errors.push({ line, reason: `未知事件类型：${values.event_type}` })
    } else if (!TIMESTAMP_RE.test(values.occurred_at) || Number.isNaN(Date.parse(values.occurred_at.replace(' ', 'T')))) {
      errors.push({ line, reason: `时间格式无效：${values.occurred_at}` })
    }
  }
  return { rows: records.length, valid: records.length - errors.length, errors }
}

export async function mockFetch(path: string, method: string, body: unknown): Promise<unknown> {
  // Small latency so loading states behave like the real network.
  await new Promise((r) => setTimeout(r, 150 + Math.random() * 150))
  const pathname = path.split('?')[0]
  const route = `${method} ${pathname}`

  if (route === 'POST /data/csv/customers' || route === 'POST /data/csv/events') {
    const kind = route.endsWith('customers') ? 'customers' : 'events'
    const result = validateCsv(kind, await readUpload(body))
    return { ok: true, import_id: `mock-${crypto.randomUUID()}`, mocked: true, ...result }
  }
  if (route === 'POST /integrations/feishu/sync') throw new MockHttpError(400, 'feishu credentials missing')

  throw new MockHttpError(501, 'not implemented')
}
