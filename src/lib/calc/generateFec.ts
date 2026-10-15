/**
 * generateFec — docs/03_MasterPrompts.md §13.6 item 3, per the exact French
 * FEC (Fichier des Écritures Comptables) specification, article A47 A-1 du
 * Livre des procédures fiscales (arrêté du 29 juillet 2013). A real
 * government-format requirement, not a free-form export — pure and
 * deterministic so its output can be tested against known-good rows.
 *
 * The 18 required columns, in the exact legally-mandated order:
 *   JournalCode, JournalLib, EcritureNum, EcritureDate, CompteNum,
 *   CompteLib, CompAuxNum, CompAuxLib, PieceRef, PieceDate, EcritureLib,
 *   Debit, Credit, EcritureLet, DateLet, ValidDate, Montantdevise, Idevise
 *
 * Format choices made here (each is explicitly permitted by the arrêté,
 * verified against the article text — see docs/07_ProjectState.md's Step
 * 13.6 log for the two specific details that could only be confirmed
 * against widespread practitioner convention rather than primary legal
 * text, and should be spot-checked against the DGFiP's free "Test Compta
 * Demat" validator before this is ever used for a real filing):
 *   - Field separator: pipe `|` (the arrêté permits tab or pipe).
 *   - Encoding: UTF-8 (one of three permitted options; caller's
 *     responsibility to write the file as UTF-8).
 *   - Dates: AAAAMMJJ (YYYYMMDD), no separators.
 *   - Amounts: period decimal separator, no thousands separator, unsigned
 *     magnitudes split across separate Debit/Credit columns (never signed).
 *   - Header row included (universal practice, required for the file to be
 *     usable by accounting software even though not spelled out as an
 *     explicit per-row rule in the article text).
 */

export const FEC_COLUMNS = [
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
] as const

export interface FecRow {
  journalCode: string
  journalLib: string
  ecritureNum: string
  ecritureDate: string // ISO date (YYYY-MM-DD) — converted to AAAAMMJJ here
  compteNum: string
  compteLib: string
  compAuxNum?: string
  compAuxLib?: string
  pieceRef: string
  pieceDate: string // ISO date
  ecritureLib: string
  debit: number
  credit: number
  ecritureLet?: string
  dateLet?: string // ISO date, only when ecritureLet is set
  validDate: string // ISO date
}

function toFecDate(isoDate: string): string {
  return isoDate.replaceAll('-', '')
}

function formatAmount(n: number): string {
  // Never a thousands separator; period decimal; always 2 decimal places;
  // a genuine 0 (not the empty string) for the non-moved side of an entry.
  return n.toFixed(2)
}

function fecField(value: string | undefined): string {
  return value ?? ''
}

export function generateFecRow(row: FecRow): string {
  const fields = [
    row.journalCode,
    row.journalLib,
    row.ecritureNum,
    toFecDate(row.ecritureDate),
    row.compteNum,
    row.compteLib,
    fecField(row.compAuxNum),
    fecField(row.compAuxLib),
    row.pieceRef,
    toFecDate(row.pieceDate),
    row.ecritureLib,
    formatAmount(row.debit),
    formatAmount(row.credit),
    fecField(row.ecritureLet),
    row.dateLet ? toFecDate(row.dateLet) : '',
    toFecDate(row.validDate),
    '', // Montantdevise — left empty; this app doesn't handle foreign-currency entries
    '', // Idevise — same
  ]
  return fields.join('|')
}

/** Generates a complete FEC file's text content, header row included. */
export function generateFecFile(rows: FecRow[]): string {
  const header = FEC_COLUMNS.join('|')
  const lines = rows.map(generateFecRow)
  return [header, ...lines].join('\r\n')
}

/** {SIREN}FEC{AAAAMMJJ}.txt — the mandated file naming convention, no
 * separators between the three components. */
export function fecFileName(siren: string, fiscalYearEndIso: string): string {
  return `${siren}FEC${toFecDate(fiscalYearEndIso)}.txt`
}
