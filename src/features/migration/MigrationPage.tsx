import * as React from 'react'
import { AlertTriangle, CheckCircle2, FileText, Upload, Wrench } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { supabase } from '@/lib/supabase'
import { apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import { parseCsv, type ParsedCsv } from './parseCsv'
import { SOURCE_INSTRUCTIONS, type SourceSoftware } from './sourceInstructions'

type ImportCategory = 'clients' | 'price_library' | 'quotes_invoices' | 'projects_in_progress'

const CATEGORY_LABELS: Record<ImportCategory, string> = {
  clients: 'Clients et contacts',
  price_library: 'Bibliothèque de prix et fournitures',
  quotes_invoices: 'Devis et factures (PDF archivés)',
  projects_in_progress: 'Chantiers en cours',
}

// Chantiers-en-cours UNCHECKED by default — docs/01_ScopeDocument.md §5.14's
// explicit transparency decision, never default this to checked.
const DEFAULT_CATEGORIES: Record<ImportCategory, boolean> = {
  clients: true,
  price_library: true,
  quotes_invoices: true,
  projects_in_progress: false,
}

const CLIENT_TARGET_FIELDS = [
  { key: 'name', label: 'Nom', required: true },
  { key: 'city', label: 'Ville', required: false },
  { key: 'phone', label: 'Téléphone', required: false },
  { key: 'email', label: 'Email', required: false },
] as const

const PRICE_ITEM_TARGET_FIELDS = [
  { key: 'label', label: 'Désignation', required: true },
  { key: 'unit', label: 'Unité', required: true },
  { key: 'sale_price', label: 'Prix de vente', required: true },
  { key: 'purchase_price', label: "Prix d'achat", required: false },
] as const

interface ImportSummary {
  imported: number
  skipped: number
  skippedReasons: string[]
}

/**
 * s-migration — Reprendre mes données. docs/03_MasterPrompts.md §13.7,
 * docs/01_ScopeDocument.md §5.14. Source-software selection with honest
 * per-source instructions, category checkboxes (chantiers-en-cours
 * unchecked by default), a real CSV-import path with column mapping +
 * preview-before-commit for clients/price-library, reassuring messaging.
 */
export default function MigrationPage() {
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const [source, setSource] = React.useState<SourceSoftware>('excel_papier')
  const [categories, setCategories] = React.useState(DEFAULT_CATEGORIES)
  const [importTarget, setImportTarget] = React.useState<'clients' | 'price_library' | null>(null)
  const [parsedCsv, setParsedCsv] = React.useState<ParsedCsv | null>(null)
  const [columnMapping, setColumnMapping] = React.useState<Record<string, string>>({})
  const [status, setStatus] = React.useState<'idle' | 'importing' | 'done'>('idle')
  const [summary, setSummary] = React.useState<ImportSummary | null>(null)
  const [archiveUploadStatus, setArchiveUploadStatus] = React.useState<
    'idle' | 'uploading' | 'error'
  >('idle')
  const [archiveUploadError, setArchiveUploadError] = React.useState<string | null>(null)
  const [archivedCount, setArchivedCount] = React.useState(0)
  const navigate = useNavigate()
  // A ref, not a state check — a state-only guard doesn't actually prevent a
  // genuine same-tick double-click, since React batches setState and a
  // second click handler invoked before the first commits can still read the
  // stale value (see SatisfactionPage.tsx's doc comment, module 15 deep
  // audit, 2026-10-08, for the full story). Found missing here too on
  // re-read (module 17 deep audit, 2026-10-08).
  const importingRef = React.useRef(false)

  const instructions = SOURCE_INSTRUCTIONS[source]

  function toggleCategory(cat: ImportCategory) {
    setCategories((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }

  async function logMigrationImport(
    importedCategories: Record<ImportCategory, boolean>,
    summaryData: Record<string, unknown>,
  ) {
    if (!user) return
    try {
      await apiWrite((client) =>
        client.from('migration_imports').insert({
          owner_id: user.id,
          source_software: source,
          imported_categories: importedCategories,
          status: 'completed',
          summary: summaryData,
          completed_at: new Date().toISOString(),
        }),
      )
    } catch {
      // Non-fatal
    }
  }

  async function handleArchivedPdfsSelected(files: FileList) {
    if (!user || files.length === 0) return
    setArchiveUploadStatus('uploading')
    setArchiveUploadError(null)

    let uploaded = 0
    const errors: string[] = []

    for (const file of Array.from(files)) {
      const storagePath = `${user.id}/upload_file/${Date.now()}-${file.name}`
      try {
        const { error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(storagePath, file)
        if (uploadErr) {
          errors.push(`${file.name} : ${uploadErr.message}`)
          continue
        }
        const { error: insertError } = await apiWrite((client) =>
          client.from('documents').insert({
            owner_id: user.id,
            name: file.name,
            doc_type: 'upload_file',
            storage_path: `documents/${storagePath}`,
            mime_type: file.type || null,
            size_bytes: file.size,
          }),
        )
        if (insertError) {
          errors.push(`${file.name} : ${insertError.message}`)
          continue
        }
        uploaded += 1
      } catch (err) {
        errors.push(`${file.name} : ${err instanceof ApiTimeoutError ? err.message : String(err)}`)
      }
    }

    if (errors.length > 0) {
      setArchiveUploadStatus('error')
      setArchiveUploadError(errors.slice(0, 5).join(' · '))
    } else {
      setArchiveUploadStatus('idle')
    }
    setArchivedCount((prev) => prev + uploaded)
    if (uploaded > 0) {
      await logMigrationImport(categories, { quotes_invoices_archived: uploaded })
    }
  }

  function handleFileSelected(target: 'clients' | 'price_library', file: File) {
    setImportTarget(target)
    setSummary(null)
    setStatus('idle')
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const parsed = parseCsv(text)
      setParsedCsv(parsed)
      const targetFields = target === 'clients' ? CLIENT_TARGET_FIELDS : PRICE_ITEM_TARGET_FIELDS
      const autoMapping: Record<string, string> = {}
      for (const field of targetFields) {
        const match = parsed.headers.find(
          (h) =>
            h.toLowerCase().trim() === field.label.toLowerCase().trim() ||
            h.toLowerCase().trim() === field.key.toLowerCase().trim(),
        )
        if (match) autoMapping[field.key] = match
      }
      setColumnMapping(autoMapping)
    }
    reader.readAsText(file, 'utf-8')
  }

  async function handleCommitImport() {
    if (!user || !parsedCsv || !importTarget || importingRef.current) return
    importingRef.current = true
    setStatus('importing')

    const targetFields =
      importTarget === 'clients' ? CLIENT_TARGET_FIELDS : PRICE_ITEM_TARGET_FIELDS
    const headerIndex = new Map(parsedCsv.headers.map((h, i) => [h, i]))

    let imported = 0
    let skipped = 0
    const skippedReasons: string[] = []
    const rowsToInsert: Record<string, unknown>[] = []

    for (const row of parsedCsv.rows) {
      const record: Record<string, unknown> = { owner_id: user.id }
      let missingRequired = false

      for (const field of targetFields) {
        const columnName = columnMapping[field.key]
        const colIdx = columnName ? headerIndex.get(columnName) : undefined
        const rawValue = colIdx !== undefined ? row[colIdx] : undefined

        if (field.required && (!rawValue || !rawValue.trim())) {
          missingRequired = true
          break
        }
        if (rawValue) {
          if (field.key === 'sale_price' || field.key === 'purchase_price') {
            record[field.key] = Number(rawValue.replace(',', '.')) || 0
          } else {
            record[field.key] = rawValue
          }
        }
      }

      if (missingRequired) {
        skipped += 1
        skippedReasons.push(`Ligne ignorée — champ obligatoire manquant`)
        continue
      }

      if (importTarget === 'clients') {
        rowsToInsert.push({
          owner_id: user.id,
          name: record.name,
          address: record.city ? { city: record.city } : null,
          phone: record.phone ?? null,
          email: record.email ?? null,
          status: 'active',
        })
      } else {
        rowsToInsert.push({
          owner_id: user.id,
          label: record.label,
          unit: record.unit,
          sale_price: record.sale_price ?? 0,
          purchase_price: record.purchase_price ?? 0,
          default_vat_rate: 20,
          is_supply: true,
          active: true,
        })
      }
      imported += 1
    }

    if (rowsToInsert.length > 0) {
      const table = importTarget === 'clients' ? 'clients' : 'price_items'
      try {
        const { error } = await apiWrite((client) => client.from(table).insert(rowsToInsert))
        if (error) {
          skipped += imported
          skippedReasons.push(error.message)
          imported = 0
        }
      } catch (err) {
        skipped += imported
        skippedReasons.push(err instanceof ApiTimeoutError ? err.message : "Échec de l'import.")
        imported = 0
      }
    }

    setSummary({ imported, skipped, skippedReasons: skippedReasons.slice(0, 5) })
    setStatus('done')
    importingRef.current = false
    if (imported > 0) {
      await logMigrationImport(categories, { [importTarget]: imported })
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-4xl flex-col p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="font-serif text-[24px] sm:text-[28px] font-black tracking-tight text-text-hi">
          Reprendre mes données
        </h1>
        <p className="mt-1 text-[13px] text-text-mid">
          Importe ton fichier clients, ta bibliothèque d'articles ou tes documents passés
        </p>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-brand-200/70 dark:border-brand-800/70 bg-brand-50/60 dark:bg-brand-950/30 p-4 text-[12.5px] text-text-hi">
        <span className="text-base">💡</span>
        <span>
          <strong className="font-bold">Conseil transition :</strong> garde ton ancien logiciel actif en parallèle pendant quelques semaines pour vérifier les factures en cours et faire une transition en toute sérénité.
        </span>
      </div>

      <div className="flex flex-col gap-6">
        <div className="rounded-xl border border-divider/60 bg-surface p-5 shadow-sm">
          <span className="mb-3 block text-[11px] font-black tracking-[0.06em] text-text-mid uppercase">
            Logiciel d'origine
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {(Object.keys(SOURCE_INSTRUCTIONS) as SourceSoftware[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={`rounded-xl border p-3 text-center text-[12.5px] font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                  source === s
                    ? 'border-brand-500 bg-brand-50/80 dark:bg-brand-950/40 text-text-hi shadow-xs ring-1 ring-brand-500/30 font-extrabold'
                    : 'border-divider/60 bg-surface text-text-hi hover:border-brand-500/40'
                }`}
              >
                {SOURCE_INSTRUCTIONS[s].label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-divider/60 bg-surface p-5 shadow-sm">
          <p className="mb-3 text-[13px] font-extrabold text-text-hi">
            Comment exporter depuis {instructions.label}
          </p>
          <ol className="flex flex-col gap-2 text-[12.5px] text-text-mid">
            {instructions.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-recessed text-[11px] font-bold text-text-mid mt-0.5">
                  {i + 1}
                </span>
                <span className="flex-1 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          {instructions.needsReview ? (
            <div className="mt-3.5 flex items-start gap-2 rounded-lg bg-recessed/70 p-2.5 text-[11.5px] text-text-low">
              <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-text-mid" />
              <span>
                Ces étapes sont une estimation générique — à vérifier auprès du support{' '}
                {instructions.label} selon ta version installée.
              </span>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-divider/60 bg-surface p-5 shadow-sm">
          <span className="mb-3 block text-[11px] font-black tracking-[0.06em] text-text-mid uppercase">
            Que souhaites-tu importer ?
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(Object.keys(CATEGORY_LABELS) as ImportCategory[]).map((cat) => (
              <label
                key={cat}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                  categories[cat]
                    ? 'border-brand-500/30 bg-brand-50/30 dark:bg-brand-950/20 text-text-hi'
                    : 'border-divider/60 bg-surface text-text-mid opacity-70'
                }`}
              >
                <input
                  type="checkbox"
                  checked={categories[cat]}
                  onChange={() => toggleCategory(cat)}
                  className="h-4.5 w-4.5 rounded border-divider text-brand-600 focus:ring-brand-500"
                />
                <span className="text-[13px] font-bold">{CATEGORY_LABELS[cat]}</span>
              </label>
            ))}
          </div>
        </div>

        {categories.clients || categories.price_library ? (
          <div className="rounded-xl border border-divider/60 bg-surface p-5 shadow-sm">
            <span className="mb-3 block text-[11px] font-black tracking-[0.06em] text-text-mid uppercase">
              Import de fichiers CSV
            </span>
            <div className="flex flex-col sm:flex-row gap-3">
              {categories.clients ? (
                <label className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-divider/60 bg-recessed/50 px-4 text-[13px] font-bold text-text-hi hover:bg-recessed transition-colors">
                  <Upload size={16} strokeWidth={2} className="text-brand-500" />
                  Importer Clients (.csv)
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileSelected('clients', file)
                    }}
                  />
                </label>
              ) : null}
              {categories.price_library ? (
                <label className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-divider/60 bg-recessed/50 px-4 text-[13px] font-bold text-text-hi hover:bg-recessed transition-colors">
                  <Upload size={16} strokeWidth={2} className="text-brand-500" />
                  Importer Articles (.csv)
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileSelected('price_library', file)
                    }}
                  />
                </label>
              ) : null}
            </div>
          </div>
        ) : null}

        {categories.quotes_invoices ? (
          <div className="rounded-xl border border-divider/60 bg-surface p-5 shadow-sm">
            <p className="text-[13px] font-extrabold text-text-hi">
              {CATEGORY_LABELS.quotes_invoices}
            </p>
            <p className="mt-1 mb-3 text-[12px] text-text-mid leading-relaxed">
              Chaque devis ou facture exporté en PDF depuis ton ancien outil est archivé tel quel dans Kōv. Tu pourras les consulter à tout moment depuis l'espace documents.
            </p>
            <label className="inline-flex h-11 w-full sm:w-auto cursor-pointer items-center justify-center gap-2 rounded-xl border border-divider/60 bg-recessed px-4 text-[12.5px] font-bold text-text-hi hover:bg-recessed transition-colors">
              <FileText size={16} strokeWidth={2} className="text-brand-500" />
              Sélectionner des PDF archivés
              <input
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                disabled={archiveUploadStatus === 'uploading' || !isOnline}
                onChange={(e) => {
                  if (e.target.files) handleArchivedPdfsSelected(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
            {archiveUploadStatus === 'uploading' ? (
              <p className="mt-2 text-[12px] font-bold text-text-mid">Transfert en cours...</p>
            ) : null}
            {archiveUploadStatus === 'error' && archiveUploadError ? (
              <InlineError message={archiveUploadError} className="mt-2" />
            ) : null}
            {archivedCount > 0 ? (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] font-bold text-success-text">
                <CheckCircle2 size={15} strokeWidth={2.5} />
                {archivedCount} document{archivedCount > 1 ? 's' : ''} archivé{archivedCount > 1 ? 's' : ''} avec succès.
              </p>
            ) : null}
          </div>
        ) : null}

        {categories.projects_in_progress ? (
          <div className="rounded-xl border border-gold-400/50 bg-gold-50/70 dark:bg-gold-950/30 p-5">
            <p className="flex items-center gap-2 text-[13px] font-black text-gold-900 dark:text-gold-200">
              <AlertTriangle size={16} strokeWidth={2.5} className="shrink-0 text-gold-600 dark:text-gold-400" />
              {CATEGORY_LABELS.projects_in_progress}
            </p>
            <p className="mt-1 mb-3 text-[12px] text-gold-900/90 dark:text-gold-200/90 leading-relaxed">
              Choix de transparence assumé : un chantier en cours ne peut pas être importé automatiquement car aucun format standard universel n'existe. Crée-le manuellement dans Kōv en quelques minutes pour auditer directement ses dépenses réelles.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/quotes')}
              className="gap-1.5 font-bold text-xs"
            >
              <Wrench size={14} strokeWidth={2} />
              Créer un devis / chantier
            </Button>
          </div>
        ) : null}

        {parsedCsv && importTarget && status !== 'done' ? (
          <div className="rounded-xl border border-divider/60 bg-surface p-5 shadow-sm flex flex-col gap-4">
            <p className="text-[13px] font-extrabold text-text-hi">
              Correspondance des colonnes — {parsedCsv.rows.length} ligne{parsedCsv.rows.length > 1 ? 's' : ''} détectée{parsedCsv.rows.length > 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(importTarget === 'clients' ? CLIENT_TARGET_FIELDS : PRICE_ITEM_TARGET_FIELDS).map(
                (field) => (
                  <div key={field.key} className="flex flex-col gap-1">
                    <span className="text-[12px] font-bold text-text-mid">
                      {field.label}
                      {field.required ? ' *' : ''}
                    </span>
                    <select
                      value={columnMapping[field.key] ?? ''}
                      onChange={(e) =>
                        setColumnMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className="h-10 rounded-lg border border-divider/60 bg-surface px-3 text-[12.5px] text-text-hi outline-none focus:ring-2 focus:ring-brand-500/45"
                    >
                      <option value="">— non mappé —</option>
                      {parsedCsv.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ),
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-divider/60">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="bg-recessed/70">
                    {parsedCsv.headers.map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-bold text-text-mid">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedCsv.rows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-t border-divider/60">
                      {row.map((cell, j) => (
                        <td key={j} className="px-3 py-2 text-text-hi">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button
              variant="primary"
              disabled={status === 'importing' || !isOnline}
              onClick={handleCommitImport}
              className="w-full font-bold text-[13px]"
            >
              {status === 'importing' ? 'Import en cours...' : "Confirmer et enregistrer l'import"}
            </Button>
            {!isOnline ? (
              <p className="text-center text-[11px] font-bold text-text-mid">
                Hors ligne — connexion requise pour enregistrer les données.
              </p>
            ) : null}
          </div>
        ) : null}

        {summary ? (
          <div
            className={`rounded-xl p-5 text-[13px] shadow-sm border ${
              summary.imported === 0
                ? 'border-error/30 bg-error-bg text-error-text'
                : 'border-margin-green/30 bg-margin-green/10 text-success-text'
            }`}
          >
            <p className="font-extrabold flex items-center gap-2">
              {summary.imported > 0 ? <CheckCircle2 size={16} strokeWidth={2.5} /> : null}
              {summary.imported} ligne{summary.imported > 1 ? 's' : ''} importée{summary.imported > 1 ? 's' : ''}
              {summary.skipped > 0
                ? `, ${summary.skipped} ignorée${summary.skipped > 1 ? 's' : ''}`
                : ''}
            </p>
            {summary.skippedReasons.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-[11.5px] space-y-0.5">
                {summary.skippedReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

