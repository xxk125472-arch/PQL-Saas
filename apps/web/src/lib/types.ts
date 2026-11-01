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

/** Mock CSV check (FEATURE_BACKEND.csv = 'mock'): validates rows only, writes nothing. */
export type UploadResult = {
  ok: boolean
  import_id: string
  mocked?: boolean
  rows: number
  valid: number
  errors: Array<{ line: number; reason: string }>
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
