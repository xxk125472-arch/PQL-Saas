// Which features hit the real FastAPI backend and which are answered by the in-browser mock.
// Default: everything real. For offline demos, set VITE_MOCK_FEATURES=csv,feishu (comma list)
// in apps/web/.env.local — only csv / feishu have mock handlers (see ./mock/server.ts).

export type Backend = 'real' | 'mock'

const DEFAULT_BACKEND = {
  auth: 'real', // /auth/*, /me
  overview: 'real', // /overview/funnel
  customers: 'real', // /customers, /customers/{id}
  synthetic: 'real', // POST / DELETE /data/synthetic
  csv: 'real', // /data/csv/*
  settings: 'real', // /settings
  feishu: 'real', // /integrations/feishu/*
  analysis: 'real', // /analysis/*
} satisfies Record<string, Backend>

const MOCK_OVERRIDE = new Set(
  String(import.meta.env.VITE_MOCK_FEATURES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

export const FEATURE_BACKEND: Record<keyof typeof DEFAULT_BACKEND, Backend> = Object.fromEntries(
  Object.entries(DEFAULT_BACKEND).map(([k, v]) => [k, MOCK_OVERRIDE.has(k) ? 'mock' : v]),
) as Record<keyof typeof DEFAULT_BACKEND, Backend>

export type Feature = keyof typeof DEFAULT_BACKEND

export const FEATURE_LABEL: Record<Feature, string> = {
  auth: '登录注册',
  overview: '总览',
  customers: '客户',
  synthetic: '演示数据',
  csv: 'CSV 导入',
  settings: '评分设置',
  feishu: '飞书同步',
  analysis: '每周重点分析',
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
