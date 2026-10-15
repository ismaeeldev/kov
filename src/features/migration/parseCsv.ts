/**
 * parseCsv — docs/03_MasterPrompts.md §13.7 item 2's CSV-import path for
 * clients and price-library items. A small, pure, dependency-free parser —
 * good enough for the well-defined "spreadsheet export from another tool"
 * use case this covers, no need for a full RFC-4180 library here.
 */

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

/** Single-pass, quote-aware tokenizer over the WHOLE file, not per-line —
 * previously this split the file into lines via `text.split(/\r\n|\n|\r/)`
 * BEFORE any quote-awareness was applied, so a legitimate quoted field
 * containing an embedded newline (e.g. a multi-line address pasted from
 * Excel: `"12 rue de la Paix\nAppt 4"`, very common in a real French
 * client/address export) got split into two separate "lines" and parsed as
 * two separate rows — silently misaligning every field after that point for
 * the rest of the file, with no error surfaced (module 17 deep audit,
 * 2026-10-08). A newline is only a row boundary when it occurs OUTSIDE an
 * open quote; inside quotes it's just another character in the field. */
function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  function endField() {
    currentRow.push(current.trim())
    current = ''
  }
  function endRow() {
    endField()
    rows.push(currentRow)
    currentRow = []
  }

  while (i < text.length) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      current += char
      i++
      continue
    }
    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === ',') {
      endField()
      i++
      continue
    }
    if (char === '\r' || char === '\n') {
      // Treat \r\n as one boundary, not two empty rows.
      if (char === '\r' && text[i + 1] === '\n') i++
      endRow()
      i++
      continue
    }
    current += char
    i++
  }
  // Final field/row if the file doesn't end with a trailing newline.
  if (current.length > 0 || currentRow.length > 0) {
    endRow()
  }

  // Drop genuinely blank lines (every field empty) — matches the original
  // parser's "ignores blank lines" behavior, generalized beyond the
  // single-column case.
  return rows.filter((row) => row.some((field) => field.length > 0))
}

export function parseCsv(text: string): ParsedCsv {
  const rows = tokenizeCsv(text)
  if (rows.length === 0) return { headers: [], rows: [] }
  const [headers, ...dataRows] = rows
  return { headers, rows: dataRows }
}
