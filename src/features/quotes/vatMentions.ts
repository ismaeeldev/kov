/**
 * VAT legal mentions table (France) — docs/01_ScopeDocument.md §5.4.
 * Maps quotes.vat_mention_code to the exact legally-required French text.
 * `null` (the standard case, vat_rate applied normally) has no mention.
 */
export type VatMentionCode = 'autoliquidation' | 'franchise' | 'export' | null

export const VAT_MENTIONS: Record<Exclude<VatMentionCode, null>, string> = {
  autoliquidation: 'Art. 283-2 nonies du CGI — TVA due par le preneur',
  franchise: 'TVA non applicable — art. 293 B du CGI',
  export: 'Exonération — prestation hors champ territorial français',
}

export const VAT_MENTION_OPTIONS: { value: VatMentionCode; label: string }[] = [
  { value: null, label: 'Aucune (TVA standard)' },
  { value: 'autoliquidation', label: 'Autoliquidation' },
  { value: 'franchise', label: 'Franchise en base' },
  { value: 'export', label: 'Export / hors UE' },
]

export function getVatMentionText(code: VatMentionCode): string | null {
  return code ? VAT_MENTIONS[code] : null
}
