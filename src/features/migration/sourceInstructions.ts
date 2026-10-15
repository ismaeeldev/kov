/**
 * sourceInstructions — docs/03_MasterPrompts.md §13.7 item 1's explicit
 * instruction: write realistic per-source export instructions where
 * confident, and "if you're not confident about a specific tool's real
 * export steps, write generic-but-accurate CSV/PDF export guidance and flag
 * it as needing a real product-support review before shipping" otherwise.
 *
 * NONE of Tolteck/Obat/Batigest/EBP's exact current menu paths could be
 * verified with confidence here — competitor software UIs change between
 * versions and this project has no access to a live instance of any of
 * them. Every entry below is therefore GENERIC-BUT-ACCURATE guidance
 * (export to CSV/Excel for structured data, export to PDF for
 * quotes/invoices — true of virtually all French BTP/trade management
 * software) rather than tool-specific menu instructions, and is flagged
 * with `needsReview: true` so this is visible in the UI and never silently
 * presented as verified, tool-specific guidance.
 */

export type SourceSoftware = 'tolteck' | 'obat' | 'batigest' | 'ebp' | 'excel_papier' | 'autre'

export interface SourceInstructions {
  label: string
  steps: string[]
  needsReview: boolean
}

export const SOURCE_INSTRUCTIONS: Record<SourceSoftware, SourceInstructions> = {
  tolteck: {
    label: 'Tolteck',
    steps: [
      'Ouvre la liste de tes clients, puis utilise l’option d’export (généralement au format Excel/CSV) depuis le menu de la liste.',
      'Fais de même pour ta bibliothèque de prix/articles si Tolteck la gère séparément.',
      'Pour tes devis et factures déjà émis, exporte-les individuellement en PDF depuis leur fiche — ils seront archivés tels quels dans Kōv.',
    ],
    needsReview: true,
  },
  obat: {
    label: 'Obat',
    steps: [
      'Depuis la liste de tes clients, cherche une option "Exporter" ou "Exporter en CSV/Excel".',
      'Exporte ta bibliothèque de prix de la même façon si elle est accessible en liste.',
      'Exporte tes devis et factures existants au format PDF depuis leur fiche respective.',
    ],
    needsReview: true,
  },
  batigest: {
    label: 'Batigest',
    steps: [
      'Utilise la fonction d’export de données (souvent accessible depuis le menu Fichier ou Outils) pour extraire tes clients au format CSV/Excel.',
      'Exporte ta bibliothèque d’articles/prix de la même manière.',
      'Génère un PDF pour chaque devis et facture que tu veux conserver dans Kōv.',
    ],
    needsReview: true,
  },
  ebp: {
    label: 'EBP',
    steps: [
      'EBP propose généralement un assistant d’export de données — cherche-le dans le menu Fichier.',
      'Exporte tes clients et ta bibliothèque de prix au format CSV/Excel.',
      'Exporte tes devis et factures au format PDF depuis leur liste ou leur fiche.',
    ],
    needsReview: true,
  },
  excel_papier: {
    label: 'Excel / papier',
    steps: [
      'Si tes données sont déjà dans un fichier Excel ou Google Sheets, exporte-le (ou enregistre-le) au format CSV.',
      'La première ligne doit contenir les noms de colonnes (nom, ville, téléphone, etc.) — tu pourras faire correspondre chaque colonne à l’étape suivante.',
      'Pour des documents papier, prends-les simplement en photo ou scanne-les — tu pourras les importer comme pièces jointes.',
    ],
    needsReview: false,
  },
  autre: {
    label: 'Autre logiciel',
    steps: [
      'La plupart des logiciels de gestion permettent d’exporter tes clients et ta bibliothèque de prix au format CSV ou Excel — cherche une option "Exporter" dans la liste concernée.',
      'Pour tes devis et factures, une exportation ou impression au format PDF fonctionne dans la quasi-totalité des logiciels.',
      'Si tu ne trouves pas l’option, contacte le support de ton logiciel actuel — ils pourront te guider précisément.',
    ],
    needsReview: false,
  },
}
