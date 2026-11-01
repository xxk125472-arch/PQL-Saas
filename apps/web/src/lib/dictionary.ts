import type { BadgeTone } from '@/components/ui/badge'
import type { ActionCode, Stage } from './types'

// Copy from docs/ui/UI-IA-v1.md §5; colours remapped to DESIGN.md semantics per §7.3.

export const STAGES: Record<Stage, { label: string; tone: BadgeTone }> = {
  new: { label: '新客', tone: 'gray' },
  installed: { label: '已安装', tone: 'blue' },
  first_value: { label: '首次价值', tone: 'teal' },
  reuse: { label: '复用', tone: 'violet' },
  retention: { label: '留存', tone: 'mint' },
  at_risk: { label: '风险', tone: 'amber' },
  churned: { label: '流失', tone: 'red' },
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
  reuse: '复用',
  retention_active: '留存活跃',
  feature_use: '功能使用',
  other: '其他',
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

export const HEALTH_LEVELS: Record<HealthLevel, { label: string; dot: string }> = {
  healthy: { label: '健康', dot: 'var(--hue-mint)' },
  fair: { label: '一般', dot: 'var(--warning)' },
  risk: { label: '风险倾向', dot: 'var(--destructive)' },
}

export const SOURCES: Record<string, string> = { synthetic: '演示数据', csv: 'CSV', feishu: '飞书', manual: '手动' }
