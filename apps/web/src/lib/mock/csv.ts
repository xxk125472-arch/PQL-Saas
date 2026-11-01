/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF, optional BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // drop fully blank lines
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Parse into header-keyed records; `line` is the 1-based file line (header = line 1). */
export function parseCsvRecords(text: string): { header: string[]; records: Array<{ line: number; values: Record<string, string> }> } {
  const rows = parseCsv(text)
  const header = (rows[0] ?? []).map((h) => h.trim())
  const records = rows.slice(1).map((r, i) => ({
    line: i + 2,
    values: Object.fromEntries(header.map((h, j) => [h, (r[j] ?? '').trim()])),
  }))
  return { header, records }
}
