import { describe, expect, it } from 'vitest'
import { parseCsv } from './parseCsv'

describe('parseCsv', () => {
  it('parses a simple CSV with header + rows', () => {
    const result = parseCsv('name,city\nBernard Dupont,Rennes\nMartine Lefevre,Nantes')
    expect(result.headers).toEqual(['name', 'city'])
    expect(result.rows).toEqual([
      ['Bernard Dupont', 'Rennes'],
      ['Martine Lefevre', 'Nantes'],
    ])
  })

  it('handles a quoted field containing a comma', () => {
    const result = parseCsv('name,address\n"Dupont, Bernard","12 rue de la Paix, Rennes"')
    expect(result.rows[0]).toEqual(['Dupont, Bernard', '12 rue de la Paix, Rennes'])
  })

  it('handles an escaped double-quote inside a quoted field', () => {
    const result = parseCsv('label\n"Chauffe-eau ""Compact"" 200L"')
    expect(result.rows[0]).toEqual(['Chauffe-eau "Compact" 200L'])
  })

  it('ignores blank lines', () => {
    const result = parseCsv('name\nBernard\n\nMartine\n')
    expect(result.rows).toHaveLength(2)
  })

  it('returns empty headers/rows for an empty string', () => {
    const result = parseCsv('')
    expect(result.headers).toEqual([])
    expect(result.rows).toEqual([])
  })

  it('handles CRLF line endings', () => {
    const result = parseCsv('name,city\r\nBernard,Rennes\r\n')
    expect(result.rows).toEqual([['Bernard', 'Rennes']])
  })

  it('handles an embedded newline inside a quoted field without misaligning later rows', () => {
    // Regression test for a real bug found in module 17's deep audit
    // (2026-10-08): the previous parser split the whole file into lines
    // BEFORE applying any quote-awareness, so a quoted field containing a
    // literal newline (a common real-world case: a multi-line address
    // pasted from Excel) split one row into two, silently misaligning every
    // field for the rest of the file.
    const result = parseCsv(
      'name,address,city\n' +
        '"Bernard Dupont","12 rue de la Paix\nAppt 4","Rennes"\n' +
        'Martine Lefevre,8 avenue Victor Hugo,Nantes',
    )
    expect(result.headers).toEqual(['name', 'address', 'city'])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual([
      'Bernard Dupont',
      '12 rue de la Paix\nAppt 4',
      'Rennes',
    ])
    expect(result.rows[1]).toEqual(['Martine Lefevre', '8 avenue Victor Hugo', 'Nantes'])
  })
})
