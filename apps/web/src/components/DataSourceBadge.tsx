import { API_BASE } from '@/lib/api'
import { FEATURE_LABEL, MOCKED_FEATURES } from '@/lib/backend'

/** Mono badge so demos never confuse mocked features with the live API. */
export function DataSourceBadge() {
  const mocked = MOCKED_FEATURES.map((f) => FEATURE_LABEL[f]).join('、')
  const host = API_BASE.replace(/^https?:\/\//, '')
  return (
    <span
      className="inline-flex h-6 items-center gap-1.5 rounded-full bg-surface px-2.5 font-mono text-xs text-body shadow-l1"
      title={mocked ? `已连接 ${API_BASE}；仍为模拟：${mocked}` : `已连接 ${API_BASE}`}
    >
      <span className="size-1.5 rounded-full bg-[var(--hue-mint)]" />
      {host}
      {mocked && <span className="text-mute">· 部分模拟</span>}
    </span>
  )
}
