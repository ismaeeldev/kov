import { describe, expect, it } from 'vitest'
import {
  FEC_COLUMNS,
  fecFileName,
  generateFecFile,
  generateFecRow,
  type FecRow,
} from './generateFec'

const SAMPLE_ROW: FecRow = {
  journalCode: 'VE',
  journalLib: 'Journal des ventes',
  ecritureNum: '1',
  ecritureDate: '2026-03-15',
  compteNum: '411000',
  compteLib: 'Clients',
  pieceRef: 'DEV-2026-0001',
  pieceDate: '2026-03-15',
  ecritureLib: 'Facture DEV-2026-0001',
  debit: 1200.5,
  credit: 0,
  validDate: '2026-03-15',
}

describe('FEC_COLUMNS', () => {
  it('has exactly the 18 legally-mandated columns, in order', () => {
    expect(FEC_COLUMNS).toEqual([
      'JournalCode',
      'JournalLib',
      'EcritureNum',
      'EcritureDate',
      'CompteNum',
      'CompteLib',
      'CompAuxNum',
      'CompAuxLib',
      'PieceRef',
      'PieceDate',
      'EcritureLib',
      'Debit',
      'Credit',
      'EcritureLet',
      'DateLet',
      'ValidDate',
      'Montantdevise',
      'Idevise',
    ])
    expect(FEC_COLUMNS).toHaveLength(18)
  })
})

describe('generateFecRow', () => {
  it('produces exactly 18 pipe-separated fields', () => {
    const line = generateFecRow(SAMPLE_ROW)
    expect(line.split('|')).toHaveLength(18)
  })

  it('converts ISO dates to AAAAMMJJ with no separators', () => {
    const line = generateFecRow(SAMPLE_ROW)
    const fields = line.split('|')
    expect(fields[3]).toBe('20260315') // EcritureDate
    expect(fields[9]).toBe('20260315') // PieceDate
    expect(fields[15]).toBe('20260315') // ValidDate
  })

  it('formats amounts with a period decimal separator and 2 decimal places, never a thousands separator', () => {
    const line = generateFecRow({ ...SAMPLE_ROW, debit: 1234567.5 })
    const fields = line.split('|')
    expect(fields[11]).toBe('1234567.50') // Debit
    expect(fields[11]).not.toContain(',')
  })

  it('formats a zero amount as "0.00", never as an empty string', () => {
    const line = generateFecRow(SAMPLE_ROW)
    const fields = line.split('|')
    expect(fields[12]).toBe('0.00') // Credit
  })

  it('leaves optional fields genuinely empty, not "0" or a placeholder', () => {
    const line = generateFecRow(SAMPLE_ROW)
    const fields = line.split('|')
    expect(fields[6]).toBe('') // CompAuxNum
    expect(fields[7]).toBe('') // CompAuxLib
    expect(fields[13]).toBe('') // EcritureLet
    expect(fields[14]).toBe('') // DateLet
    expect(fields[16]).toBe('') // Montantdevise
    expect(fields[17]).toBe('') // Idevise
  })

  it('fills EcritureLet and DateLet together when a lettering is provided', () => {
    const line = generateFecRow({ ...SAMPLE_ROW, ecritureLet: 'AA', dateLet: '2026-03-20' })
    const fields = line.split('|')
    expect(fields[13]).toBe('AA')
    expect(fields[14]).toBe('20260320')
  })
})

describe('generateFecFile', () => {
  it('starts with the header row followed by one line per accounting entry line', () => {
    const file = generateFecFile([SAMPLE_ROW, { ...SAMPLE_ROW, ecritureNum: '2' }])
    const lines = file.split('\r\n')
    expect(lines).toHaveLength(3) // header + 2 rows
    expect(lines[0]).toBe(FEC_COLUMNS.join('|'))
  })

  it('produces a balanced double-entry pair (debit on one line equals credit on the matching line)', () => {
    const salesLine: FecRow = { ...SAMPLE_ROW, compteNum: '411000', debit: 1200.5, credit: 0 }
    const revenueLine: FecRow = {
      ...SAMPLE_ROW,
      compteNum: '706000',
      compteLib: 'Prestations de services',
      debit: 0,
      credit: 1200.5,
    }
    const file = generateFecFile([salesLine, revenueLine])
    const lines = file.split('\r\n').slice(1)
    const totalDebit = lines.reduce((sum, l) => sum + Number(l.split('|')[11]), 0)
    const totalCredit = lines.reduce((sum, l) => sum + Number(l.split('|')[12]), 0)
    expect(totalDebit).toBeCloseTo(totalCredit, 2)
  })
})

describe('fecFileName', () => {
  it('follows the {SIREN}FEC{AAAAMMJJ}.txt convention with no separators', () => {
    expect(fecFileName('123456789', '2026-12-31')).toBe('123456789FEC20261231.txt')
  })
})
