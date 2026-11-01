import type { BadgeTone } from '@/components/ui/badge'
import type { ActionCode, Stage } from './types'

// Copy from docs/ui/UI-IA-v1.md §5. Round-3 visual pass: normal stages are all grayscale;
// only 风险 / 流失 keep a low-saturation orange / red so the eye goes straight to them.
// Raw codes are never rewritten — these maps are display-only.

export const STAGES: Record<Stage, { label: string; tone: BadgeTone }> = {
  new: { label: '新客', tone: 'gray' },
  installed: { label: '已安装', tone: 'gray' },
  first_value: { label: '首次价值', tone: 'gray' },
  reuse: { label: '复用', tone: 'gray' },
  retention: { label: '留存', tone: 'gray' },
  at_risk: { label: '风险', tone: 'risk' },
  churned: { label: '流失', tone: 'churn' },
}

export const STAGE_ORDER: Stage[] = ['new', 'installed', 'first_value', 'reuse', 'retention', 'at_risk', 'churned']

export const ACTIONS: Record<ActionCode, string> = {
  winback: '启动挽回：联系确认需求是否变化',
  reengage: '七日内触达：推送价值场景或成功案例',
  activate_install: '推动完成安装/首次打开',
  drive_first_value: '引导完成首次价值行为',
  drive_reuse: '引导第二次关键使用',
  expand_or_advocate: '高价值客户：挖掘扩展或转介绍',
  maintain: '保持观察，按周复查',
}

export const EVENT_TYPES: Record<string, string> = {
  install: '安装',
  first_value: '首次价值',
  feature_use: '功能使用',
  reuse: '复用',
  retention_active: '留存活跃',
  other: '其他',
}

export const FEATURE_KEYS: Record<string, string> = {
  dashboard: '看板',
  funnel: '漏斗',
  import_csv: 'CSV 导入',
  score_view: '查看评分',
  analysis: 'AI 分析',
  settings: '设置',
  feishu_sync: '飞书同步',
}

export const HEALTH_FACTORS: Record<string, string> = {
  recency: '近度',
  frequency: '频度',
  depth: '功能深度',
  stage_progress: '阶段进度',
}

export const PQL_FACTORS: Record<string, string> = {
  activation: '激活',
  engagement: '复用与频度',
  health: '健康分',
  recency_boost: '近 7 天活跃',
}

export type HealthLevel = 'healthy' | 'fair' | 'risk'

export function healthLevel(score: number): HealthLevel {
  if (score >= 80) return 'healthy'
  if (score >= 50) return 'fair'
  return 'risk'
}

// Restrained dots: healthy is a neutral gray, only fair / risk carry the muted warm hues.
export const HEALTH_LEVELS: Record<HealthLevel, { label: string; dot: string }> = {
  healthy: { label: '健康', dot: 'var(--border-strong)' },
  fair: { label: '一般', dot: 'var(--hue-risk)' },
  risk: { label: '风险倾向', dot: 'var(--hue-churn)' },
}

export const SOURCES: Record<string, string> = { synthetic: '演示数据', csv: 'CSV 导入', feishu: '飞书同步', manual: '手动' }

export const STAGE_LABEL = (code: string) => (STAGES as Record<string, { label: string }>)[code]?.label
export const ACTION_LABEL = (code: string) => (ACTIONS as Record<string, string>)[code]

/** Display name for the only official skill (backend name is kept as-is in the API). */
export const SKILL_LABEL: Record<string, string> = { weekly_focus_v1: '每周重点分析' }
