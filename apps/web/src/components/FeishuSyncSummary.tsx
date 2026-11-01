import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { syncErrorRow, syncSummary } from '@/lib/feishu'
import type { FeishuSyncResult } from '@/lib/types'
import { cn } from '@/lib/utils'

const MAX_SHOWN = 50 // backend caps errors at MAX_ROW_ERRORS = 50

/** One-line sync summary + collapsible per-row error list. */
export function FeishuSyncSummary({ result }: { result: FeishuSyncResult }) {
  const [open, setOpen] = useState(false)
  const errors = result.errors
  return (
    <div className="animate-fade-in grid gap-2 rounded-lg bg-surface-2 px-4 py-3 text-[13px]">
      <div className="text-body">
        <span className="font-medium text-foreground">同步完成</span>
        <span className="mx-1.5 text-mute">·</span>
        {syncSummary(result)}
      </div>
      {errors.length > 0 && (
        <div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-destructive-deep hover:underline"
          >
            <ChevronRight className={cn('size-3.5 transition-transform duration-150', open && 'rotate-90')} />
            {open ? '收起错误明细' : `查看 ${errors.length} 条错误明细`}
            {errors.length >= MAX_SHOWN && '（仅显示前 50 条）'}
          </button>
          {open && (
            <ul className="animate-fade-in mt-2 grid max-h-56 gap-1 overflow-y-auto font-mono text-xs text-destructive-deep">
              {errors.map((e, i) => (
                <li key={`${e.record}-${i}`}>
                  {syncErrorRow(e.record)}：{e.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
