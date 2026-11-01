// Which features hit the real FastAPI backend and which are still answered by the
// in-browser mock. When a backend slice ships, flip its entry to 'real' — nothing else changes.

export type Backend = 'real' | 'mock'

export const FEATURE_BACKEND = {
  auth: 'real', // /auth/*, /me
  overview: 'real', // /overview/funnel
  customers: 'real', // /customers, /customers/{id}
  synthetic: 'real', // POST / DELETE /data/synthetic
  csv: 'mock', // /data/csv/*
  settings: 'mock', // /settings (scoring weights), /settings/llm/test
  feishu: 'mock', // /integrations/feishu/*
  analysis: 'mock', // /analysis/*
} satisfies Record<string, Backend>

export type Feature = keyof typeof FEATURE_BACKEND

export const FEATURE_LABEL: Record<Feature, string> = {
  auth: '登录注册',
  overview: '总览',
  customers: '客户',
  synthetic: '演示数据',
  csv: 'CSV 导入',
  settings: '评分设置',
  feishu: '飞书同步',
  analysis: 'AI 分析',
}

const PREFIXES: Array<[string, Feature]> = [
  ['/auth/', 'auth'],
  ['/me', 'auth'],
  ['/overview/', 'overview'],
  ['/customers', 'customers'],
  ['/data/synthetic', 'synthetic'],
  ['/data/csv/', 'csv'],
  ['/settings', 'settings'],
  ['/integrations/feishu/', 'feishu'],
  ['/analysis/', 'analysis'],
]

export function featureOf(path: string): Feature | null {
  const pathname = path.split('?')[0]
  return PREFIXES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix))?.[1] ?? null
}

export function backendFor(path: string): Backend {
  const feature = featureOf(path)
  return feature ? FEATURE_BACKEND[feature] : 'real'
}

export const MOCKED_FEATURES = (Object.keys(FEATURE_BACKEND) as Feature[]).filter((f) => FEATURE_BACKEND[f] === 'mock')
