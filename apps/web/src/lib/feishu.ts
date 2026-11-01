import { ApiError, ERROR_CODE, request } from './api'
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

/** A config counts as present only once it has an App ID (PUT requires one; .env supplies one). */
export function isFeishuConfigured(c: FeishuConfig | null | undefined): c is FeishuConfig {
  return Boolean(c && c.app_id && c.app_id.trim())
}

/**
 * GET /integrations/feishu/config → the config, or null for "未配置".
 * "未配置" is either 200 with an empty config, or FEISHU_CREDENTIALS_MISSING (older backends) —
 * neither is an error. Every other failure is thrown and shown with its Chinese `detail`.
 */
export async function getFeishuConfig(): Promise<FeishuConfig | null> {
  try {
    const c = await request<FeishuConfig>('/integrations/feishu/config')
    return isFeishuConfigured(c) ? c : null
  } catch (err) {
    if (err instanceof ApiError && err.code === ERROR_CODE.FEISHU_CREDENTIALS_MISSING) return null
    throw err
  }
}

/** Secret field display: `****` + last 4 chars when the backend exposes them, else `********`. */
export function maskedSecret(masked: string | null | undefined): string {
  const tail = (masked ?? '').replace(/[*•]/g, '')
  return tail.length >= 4 ? `****${tail.slice(-4)}` : '********'
}

/** Whether the backend reports a stored secret (a bare `****` mask of nothing doesn't count). */
export function hasSecret(masked: string | null | undefined): boolean {
  return Boolean(masked && masked.trim())
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
