import { getDataSource } from '@/lib/dataSource'

/** Small mono badge so demos never confuse sample data with the live API. */
export function DataSourceBadge() {
  const mock = getDataSource() === 'mock'
  return (
    <span
      className="inline-flex h-6 items-center gap-1.5 rounded-full bg-surface px-2.5 font-mono text-xs text-body shadow-l1"
      title={mock ? '当前使用 data/sample 本地样例数据' : '当前连接 http://127.0.0.1:8000'}
    >
      <span className="size-1.5 rounded-full" style={{ background: mock ? 'var(--warning)' : 'var(--hue-mint)' }} />
      {mock ? '本地样例' : '真实接口'}
    </span>
  )
}
