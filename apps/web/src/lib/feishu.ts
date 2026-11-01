import { ApiError, request } from './api'
import type { FeishuConfig, FeishuConfigUpdate, FeishuFieldMapping, FeishuSyncResult, FeishuTestResult } from './types'

/** Template defaults — mirror DEFAULT_FIELD_MAPPING in apps/api/app/services/feishu.py. */
export const DEFAULT_FIELD_MAPPING: FeishuFieldMapping = {
  external_id: 'external_id',
  name: 'name',
  external_customer_id: 'external_customer_id',
  event_type: 'event_type',
  occurred_at: 'occurred_at',
  feature_key: 'feature_key',
  event_type_values: {},
}

/**
 * GET /integrations/feishu/config. The backend answers 400 FEISHU_* when nothing is configured
 * (neither saved in the DB nor present in the local .env) — that is "未配置", not an error.
 */
export async function getFeishuConfig(): Promise<FeishuConfig | null> {
  try {
    return await request<FeishuConfig>('/integrations/feishu/config')
  } catch (err) {
    if (err instanceof ApiError && err.status === 400 && (err.code ?? '').startsWith('FEISHU_')) return null
    throw err
  }
}

export function saveFeishuConfig(body: FeishuConfigUpdate) {
  return request<FeishuConfig>('/integrations/feishu/config', { method: 'PUT', body })
}

export function testFeishu() {
  return request<FeishuTestResult>('/integrations/feishu/test', { method: 'POST' })
}

export function syncFeishu() {
  return request<FeishuSyncResult>('/integrations/feishu/sync', { method: 'POST' })
}

export function syncSummary(r: FeishuSyncResult): string {
  return (
    `客户：读取 ${r.customers_read}、新增 ${r.customers_inserted}、更新 ${r.customers_updated}；` +
    `事件：读取 ${r.events_read}、新增 ${r.events_inserted}、跳过 ${r.events_skipped}` +
    (r.errors.length ? `；${r.errors.length} 条有误` : '')
  )
}

/** Row label for a sync error: numeric index → 第 N 行, Feishu record_id → 记录 recXXX. */
export function syncErrorRow(record: string | number): string {
  return typeof record === 'number' || /^\d+$/.test(String(record)) ? `第 ${record} 行` : `记录 ${record}`
}
