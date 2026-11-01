// Client-side port of apps/api/app/services/scoring.py + METRICS-FIELDS.md §3.2,
// so mock numbers match what the backend will return for the same data.

import type { ActionCode, Stage } from '../types'

export type MockCustomer = {
  id: string
  external_id: string
  name: string
  source: 'synthetic' | 'csv' | 'feishu' | 'manual'
  created_at: string
}

export type MockEvent = {
  id: string
  customer_id: string
  event_type: string
  feature_key: string | null
  occurred_at: string
}

export type Settings = {
  health_weights: Record<string, number>
  pql_weights: Record<string, number>
  pql_threshold: number
  silent_risk_days: number
  silent_churn_days: number
  retention_window_days: number
}

export const DEFAULT_SETTINGS: Settings = {
  health_weights: { recency: 0.3, frequency: 0.25, depth: 0.2, stage_progress: 0.25 },
  pql_weights: { activation: 0.35, engagement: 0.3, health: 0.2, recency_boost: 0.15 },
  pql_threshold: 70,
  silent_risk_days: 7,
  silent_churn_days: 30,
  retention_window_days: 14,
}

/** Sample data is dated relative to this instant (data/sample/seed_manifest.json). */
export const SAMPLE_NOW = new Date('2026-11-01T06:00:00Z')

const DAY = 86_400_000

const STAGE_PROGRESS: Record<Stage, number> = {
  new: 10,
  installed: 30,
  first_value: 55,
  reuse: 75,
  retention: 100,
  at_risk: 40,
  churned: 15,
}

const clamp = (v: number) => Math.trunc(Math.max(0, Math.min(100, Math.round(v))))

function recencyScore(last: Date | null, now: Date) {
  if (!last) return 0
  const days = Math.max(0, (now.getTime() - last.getTime()) / DAY)
  if (days <= 0) return 100
  if (days >= 14) return 0
  return 100 * (1 - days / 14)
}

const frequencyScore = (n: number) => (n <= 0 ? 0 : n >= 10 ? 100 : (100 * n) / 10)

const depthScore = (n: number | null) => (n === null ? 50 : n <= 0 ? 0 : n >= 5 ? 100 : (100 * n) / 5)

function deriveStage(types: Set<string>, last: Date | null, activeDatesInWindow: number, s: Settings, now: Date): Stage {
  if (types.size === 0) return 'new'
  const reachedReuse = types.has('reuse')
  const reachedFv = types.has('first_value') || reachedReuse
  const reachedInstall = types.has('install') || reachedFv
  if (reachedFv) {
    if (!last) return 'churned'
    const silent = Math.floor((now.getTime() - last.getTime()) / DAY)
    if (silent > s.silent_churn_days) return 'churned'
    if (silent > s.silent_risk_days) return 'at_risk'
  }
  if (reachedReuse) return activeDatesInWindow >= 2 ? 'retention' : 'reuse'
  if (reachedFv) return 'first_value'
  if (reachedInstall) return 'installed'
  return 'new'
}

function suggestAction(stage: Stage, pql: number, health: number, threshold: number, hasEvents: boolean): [ActionCode, string] {
  if (stage === 'churned') return ['winback', '启动挽回：联系确认需求是否变化']
  if (stage === 'at_risk') return ['reengage', '七日内触达：推送价值场景或成功案例']
  if (stage === 'new' || !hasEvents) return ['activate_install', '推动完成安装/首次打开']
  if (stage === 'installed') return ['drive_first_value', '引导完成首次价值行为']
  if (stage === 'first_value') return ['drive_reuse', '引导第二次关键使用']
  if (pql >= threshold && health >= 80) return ['expand_or_advocate', '高价值客户：挖掘扩展或转介绍']
  return ['maintain', '保持观察，按周复查']
}

export type Scored = {
  stage: Stage
  last_active_at: string | null
  health_score: number
  pql_score: number
  is_pql: boolean
  health_breakdown: Record<string, number>
  pql_breakdown: Record<string, number>
  suggested_action: ActionCode
  action_reason: string
}

export function scoreCustomer(events: MockEvent[], s: Settings = DEFAULT_SETTINGS, now: Date = SAMPLE_NOW): Scored {
  const times = events.map((e) => new Date(e.occurred_at))
  const last = times.length ? new Date(Math.max(...times.map((t) => t.getTime()))) : null
  const windowStart = now.getTime() - s.retention_window_days * DAY
  const activeDates = new Set(
    events.filter((e) => new Date(e.occurred_at).getTime() >= windowStart).map((e) => e.occurred_at.slice(0, 10)),
  )
  const stage = deriveStage(new Set(events.map((e) => e.event_type)), last, activeDates.size, s, now)

  const recent = events.filter((e) => new Date(e.occurred_at).getTime() >= now.getTime() - 14 * DAY)
  const features = new Set(recent.map((e) => e.feature_key).filter(Boolean))
  const featureCount = features.size ? features.size : recent.length ? 0 : null

  const health_breakdown = {
    recency: recencyScore(last, now),
    frequency: frequencyScore(recent.length),
    depth: depthScore(featureCount),
    stage_progress: STAGE_PROGRESS[stage] ?? 10,
  }
  const health = clamp(Object.entries(health_breakdown).reduce((t, [k, v]) => t + v * (s.health_weights[k] ?? 0), 0))

  const activation = ['first_value', 'reuse', 'retention', 'at_risk', 'churned'].includes(stage) ? 100 : stage === 'installed' ? 40 : 0
  const stageEng = stage === 'reuse' ? 75 : stage === 'retention' ? 100 : stage === 'first_value' ? 40 : 0
  const pql_breakdown = {
    activation,
    engagement: (stageEng + health_breakdown.frequency) / 2,
    health,
    recency_boost: last && now.getTime() - last.getTime() <= 7 * DAY ? 100 : 0,
  }
  const pql = clamp(Object.entries(pql_breakdown).reduce((t, [k, v]) => t + v * (s.pql_weights[k] ?? 0), 0))
  const [suggested_action, action_reason] = suggestAction(stage, pql, health, s.pql_threshold, events.length > 0)

  return {
    stage,
    last_active_at: last ? last.toISOString() : null,
    health_score: health,
    pql_score: pql,
    is_pql: pql >= s.pql_threshold && ['first_value', 'reuse', 'retention'].includes(stage),
    health_breakdown,
    pql_breakdown,
    suggested_action,
    action_reason,
  }
}
