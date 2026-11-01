import type { ReactNode } from 'react'
import { ACTION_LABEL, STAGE_LABEL } from '@/lib/dictionary'

/*
 * Minimal Markdown renderer for weekly_focus_v1 reports (headings, lists, tables, quotes,
 * paragraphs, **bold**, `code`). No HTML passthrough — everything renders as React text,
 * so model output cannot inject markup. Table cells that are exactly a stage / action code
 * are shown in Chinese with the raw code kept in the tooltip.
 */

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; header: string[]; align: Array<'left' | 'right' | 'center'>; rows: string[][] }
  | { kind: 'quote'; text: string }
  | { kind: 'para'; text: string }

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

const isTableSep = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      blocks.push({ kind: 'heading', level: h[1].length, text: h[2].trim() })
      i++
      continue
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line)
      const align = splitRow(lines[i + 1]).map((c) =>
        c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left',
      ) as Array<'left' | 'right' | 'center'>
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]))
      blocks.push({ kind: 'table', header, align, rows })
      continue
    }
    if (/^\s*>/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push({ kind: 'quote', text: buf.join(' ') })
      continue
    }
    const li = /^\s*([-*]|\d+\.)\s+/
    if (li.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: string[] = []
      while (i < lines.length && li.test(lines[i])) items.push(lines[i++].replace(li, ''))
      blocks.push({ kind: 'list', ordered, items })
      continue
    }
    const buf: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*>|\s*([-*]|\d+\.)\s|\s*\|)/.test(lines[i])) buf.push(lines[i++])
    if (buf.length === 0) buf.push(lines[i++])
    blocks.push({ kind: 'para', text: buf.join(' ') })
  }
  return blocks
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={k++} className="font-semibold text-foreground">{tok.slice(2, -2)}</strong>)
    else out.push(<code key={k++} className="rounded-sm bg-surface-2 px-1 py-0.5 font-mono text-xs">{tok.slice(1, -1)}</code>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function cell(text: string): ReactNode {
  const zh = STAGE_LABEL(text) ?? ACTION_LABEL(text)
  if (zh) return <span title={text}>{zh}</span>
  return inline(text)
}

/** `hideQuote` drops quotes matching it (the report's own "Banner：…" line — the page shows a real banner). */
export function Markdown({ source, hideQuote }: { source: string; hideQuote?: RegExp }) {
  const blocks = parse(source).filter((b) => !(hideQuote && b.kind === 'quote' && hideQuote.test(b.text)))
  return (
    <div className="grid gap-3 text-[14px] leading-6 text-body">
      {blocks.map((b, idx) => {
        switch (b.kind) {
          case 'heading':
            return b.level === 1 ? (
              <h2 key={idx} className="heading text-xl leading-7 text-foreground">
                {inline(b.text)}
              </h2>
            ) : (
              <h3 key={idx} className="heading mt-3 text-base leading-6 text-foreground">
                {inline(b.text)}
              </h3>
            )
          case 'list': {
            const Tag = b.ordered ? 'ol' : 'ul'
            return (
              <Tag key={idx} className={b.ordered ? 'grid list-decimal gap-1 pl-5' : 'grid list-disc gap-1 pl-5 marker:text-mute'}>
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it)}</li>
                ))}
              </Tag>
            )
          }
          case 'quote':
            return (
              <blockquote key={idx} className="border-l-2 border-border-strong/60 pl-3 text-[13px] text-body">
                {inline(b.text)}
              </blockquote>
            )
          case 'table':
            return (
              <div key={idx} className="overflow-x-auto rounded-lg shadow-l1">
                <table className="w-full text-[13px]">
                  <thead className="bg-surface-2">
                    <tr>
                      {b.header.map((h, j) => (
                        <th key={j} className="px-3 py-2 font-mono text-xs font-normal whitespace-nowrap text-mute" style={{ textAlign: b.align[j] ?? 'left' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td
                            key={k}
                            className={b.align[k] === 'right' ? 'num px-3 py-2 text-right text-foreground' : 'px-3 py-2 text-foreground'}
                            style={{ textAlign: b.align[k] ?? 'left' }}
                          >
                            {cell(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          default:
            return <p key={idx}>{inline(b.text)}</p>
        }
      })}
    </div>
  )
}
