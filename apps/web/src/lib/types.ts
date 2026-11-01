// Response shapes mirrored from apps/api/app/api/v1/schemas.py

export type Me = {
  id: string
  tenant_id: string
  email: string | null
  username: string | null
  tenant_name: string
}

export type TokenResponse = { access_token: string; token_type: string }

export type Stage = 'new' | 'installed' | 'first_value' | 'reuse' | 'retention' | 'at_risk' | 'churned'

export type ActionCode =
  | 'winback'
  | 'reengage'
  | 'activate_install'
  | 'drive_first_value'
  | 'drive_reuse'
  | 'expand_or_advocate'
  | 'maintain'

export type Funnel = {
  installed: number
  first_value: number
  reuse: number
  retention: number
  customer_total: number
  pql_count: number
  at_risk_count: number
  churned_count: number
  conversion_rates: Record<string, number | null>
}

export type CustomerListItem = {
  id: string
  external_id: string
  name: string
  stage: Stage
  source: string
  health_score: number
  pql_score: number
  is_pql: boolean
  suggested_action: ActionCode
  last_active_at: string | null
  score_stale: boolean
}

export type CustomerList = {
  items: CustomerListItem[]
  total: number
  page: number
  page_size: number
}

export type CustomerEvent = {
  id: string
  event_type: string
  feature_key: string | null
  occurred_at: string
}

export type CustomerDetail = {
  id: string
  external_id: string
  name: string
  stage: Stage
  source: string
  last_active_at: string | null
  score: null | {
    health_score: number
    pql_score: number
    is_pql: boolean
    health_breakdown: Record<string, number> | null
    pql_breakdown: Record<string, number> | null
    suggested_action: ActionCode
    action_reason: string
    calculated_at: string
  }
  events: CustomerEvent[]
}

export type RowError = { line: number; reason: string }

/** POST /data/csv/customers | /data/csv/events — apps/api/app/api/v1/data.py */
export type CsvUploadResult = {
  ok: boolean
  import_id: string
  inserted: number
  updated?: number // customers only
  skipped: number
  errors: RowError[]
  /** Only set by the in-browser mock (VITE_MOCK_FEATURES=csv). */
  mocked?: boolean
}

/** POST /data/synthetic — apps/api/app/api/v1/data.py */
export type SyntheticResult = {
  ok: boolean
  import_id: string
  customers: number
  customers_inserted?: number
  events_inserted?: number
}

/** DELETE /data/synthetic */
export type SyntheticDeleteResult = { ok: boolean; deleted_customers: number }

/** Feishu field mapping — FeishuFieldMapping in schemas.py */
export type FeishuFieldMapping = {
  external_id: string
  name: string
  external_customer_id?: string | null
  event_type: string
  occurred_at: string
  feature_key?: string | null
  event_type_values: Record<string, string>
}

/** GET/PUT /integrations/feishu/config. `source` = "env" when read from the local .env. */
export type FeishuConfig = {
  app_id: string
  app_secret_masked: string | null
  app_token: string
  customers_table_id: string
  events_table_id: string
  field_mapping: FeishuFieldMapping
  source?: 'env' | 'database' | string
}

export type FeishuConfigUpdate = {
  app_id: string
  app_secret?: string
  app_token: string
  customers_table_id: string
  events_table_id: string
  field_mapping: FeishuFieldMapping
}

export type FeishuTestResult = { ok: boolean; message: string; records_read: number }

export type FeishuSyncResult = {
  ok: boolean
  import_id: string
  message: string
  customers_read: number
  customers_inserted: number
  customers_updated: number
  events_read: number
  events_inserted: number
  events_skipped: number
  customers_recomputed: number
  /** `record` is the Feishu record_id, or the 1-based row index when the record has none. */
  errors: Array<{ record: string | number; reason: string }>
}

export type AnalysisTone = 'pragmatic' | 'executive'

export type AnalysisParams = {
  focus_window_days: number
  risk_limit: number
  pql_limit: number
  tone: AnalysisTone
  language: 'zh-CN'
}

/** AnalysisRunResponse */
export type AnalysisRun = {
  id: string
  skill_id: string
  params_json: Partial<AnalysisParams> | null
  mode: 'llm' | 'rules_only' | string
  status: string
  report_md: string | null
  error: string | null
  latency_ms: number | null
  created_at: string
}

export type SkillItem = { id: string; name: string; description: string; enabled: boolean }
