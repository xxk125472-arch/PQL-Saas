// Backend stores UTC without a zone suffix; treat naive timestamps as UTC.
export function parseDate(value: string): Date {
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`)
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const d = parseDate(value)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatRelative(value: string | null): string {
  if (!value) return '—'
  const diff = Date.now() - parseDate(value).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} 天前`
  return formatDateTime(value).slice(0, 10)
}

export function formatPercent(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${(v * 100).toFixed(1)}%`
}

export function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN')
}
