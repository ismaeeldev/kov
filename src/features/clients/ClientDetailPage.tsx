import * as React from 'react'
import { Archive, ArrowLeft, FileText, Mic, Upload } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { DictationRings } from '@/components/ui/DictationRings'
import { InlineError } from '@/components/ui/InlineError'
import { Input } from '@/components/ui/Input'
import { JournalEntryModal } from '@/components/ui/JournalEntryModal'
import { JournalTimeline, type JournalEntry } from '@/components/ui/JournalTimeline'
import { Modal } from '@/components/ui/Modal'
import { Skeleton, SkeletonCard, SkeletonFormField, SkeletonStatTile } from '@/components/ui/Skeleton'
import { StatTile } from '@/components/ui/StatTile'
import { useAuth } from '@/hooks/useAuth'
import { useDictation } from '@/hooks/useDictation'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import { supabase } from '@/lib/supabase'
import { isSirenValid } from '@/features/onboarding/BusinessInfoForm'

interface ClientRecord {
  id: string
  name: string
  address: { street?: string; postal_code?: string; city?: string } | null
  phone: string | null
  email: string | null
  siren: string | null
  status: 'active' | 'archived'
  next_followup_reminder: string | null
}

interface JournalRow {
  id: string
  entry_type: JournalEntry['type']
  direction: JournalEntry['direction']
  title: string
  body: string | null
  occurred_at: string
}

interface ClientNoteRow {
  id: string
  text_content: string
  tags: string[]
  input_method: 'typed' | 'voice'
  created_at: string
}

interface QuoteHistoryRow {
  id: string
  reference: string
  status: string
  created_at: string
}

interface ProjectHistoryRow {
  id: string
  status: string
  created_at: string
}

interface DocumentRow {
  id: string
  name: string
  doc_type: string
  storage_path: string
  created_at: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[0-9+().\s-]{6,20}$/

const emptyForm = {
  name: '',
  street: '',
  postalCode: '',
  city: '',
  phone: '',
  email: '',
  siren: '',
  nextFollowupReminder: '',
}

function toForm(client: ClientRecord | null) {
  if (!client) return emptyForm
  return {
    name: client.name,
    street: client.address?.street ?? '',
    postalCode: client.address?.postal_code ?? '',
    city: client.address?.city ?? '',
    phone: client.phone ?? '',
    email: client.email ?? '',
    siren: client.siren ?? '',
    nextFollowupReminder: client.next_followup_reminder ?? '',
  }
}

/**
 * Client Record (s-fiche-detail) — docs/03_MasterPrompts.md §7.3,
 * docs/04_ApplicationFlow.md §2.7. Handles both /clients/new (create mode)
 * and /clients/:id (existing record). Main courante and internal notes'
 * dictation wiring are explicitly deferred (see the placeholder sections
 * below) — they depend on the journal table being fed by real quote/invoice/
 * dunning/agent events that don't exist until later steps.
 */
export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const { user } = useAuth()
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()

  const [client, setClient] = React.useState<ClientRecord | null>(null)
  const [isLoading, setIsLoading] = React.useState(!isNew)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [form, setForm] = React.useState(emptyForm)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'error'>('idle')
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [archiveConfirmOpen, setArchiveConfirmOpen] = React.useState(false)
  const [archiveError, setArchiveError] = React.useState<string | null>(null)
  const [archiving, setArchiving] = React.useState(false)
  const [journalRows, setJournalRows] = React.useState<JournalRow[] | null>(null)
  const [expandedEntry, setExpandedEntry] = React.useState<JournalRow | null>(null)
  const [notes, setNotes] = React.useState<ClientNoteRow[] | null>(null)
  const [quotesHistory, setQuotesHistory] = React.useState<QuoteHistoryRow[] | null>(null)
  const [projectsHistory, setProjectsHistory] = React.useState<ProjectHistoryRow[] | null>(null)
  const [caCumulee, setCaCumulee] = React.useState(0)
  const [chantiersCount, setChantiersCount] = React.useState(0)
  const [documents, setDocuments] = React.useState<DocumentRow[] | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [noteText, setNoteText] = React.useState('')
  const [noteTagsInput, setNoteTagsInput] = React.useState('')
  const [noteInputMethod, setNoteInputMethod] = React.useState<'typed' | 'voice'>('typed')
  const [noteSaving, setNoteSaving] = React.useState(false)
  const [noteError, setNoteError] = React.useState<string | null>(null)
  const noteDictation = useDictation()
  const lastAppliedNoteTranscript = React.useRef('')
  const fetchedFor = React.useRef<string | null>(null)
  // Refs, not the adjacent state checks alone — see SatisfactionPage.tsx's
  // doc comment (module 15 deep audit, 2026-10-08). Each of these handlers
  // performs a real write (client save, archive, document upload, note
  // insert), so a same-tick double-click must not slip through twice
  // (module 20 close-out sweep, 2026-10-15).
  const savingRef = React.useRef(false)
  const archivingRef = React.useRef(false)
  const uploadingRef = React.useRef(false)
  const noteSavingRef = React.useRef(false)

  React.useEffect(() => {
    if (
      noteDictation.transcript &&
      noteDictation.transcript !== lastAppliedNoteTranscript.current
    ) {
      const newPart = noteDictation.transcript
        .slice(lastAppliedNoteTranscript.current.length)
        .trim()
      if (newPart) {
        setNoteText((prev) => (prev ? `${prev} ${newPart}`.trim() : newPart))
      }
      lastAppliedNoteTranscript.current = noteDictation.transcript
    }
  }, [noteDictation.transcript])

  function toggleNoteDictation() {
    if (noteDictation.status === 'listening') {
      noteDictation.stop()
      return
    }
    noteDictation.reset()
    lastAppliedNoteTranscript.current = ''
    setNoteInputMethod('voice')
    noteDictation.start()
  }

  const load = React.useCallback(async () => {
    if (!user || isNew || !id) return
    setLoadError(null)
    setIsLoading(true)
    let data, error, journalData, notesData, quotesData, projectsData, invoicesData, documentsData
    try {
      ;[
        { data, error },
        { data: journalData },
        { data: notesData },
        { data: quotesData },
        { data: projectsData },
        { data: invoicesData },
        { data: documentsData },
      ] = await Promise.all([
        apiRead((client) =>
          client
            .from('clients')
            .select('id, name, address, phone, email, siren, status, next_followup_reminder')
            .eq('id', id)
            .eq('owner_id', user.id)
            .single(),
        ),
        apiRead((client) =>
          client
            .from('journal')
            .select('id, entry_type, direction, title, body, occurred_at')
            .eq('client_id', id)
            .eq('owner_id', user.id)
            .order('occurred_at', { ascending: false }),
        ),
        apiRead((client) =>
          client
            .from('client_notes')
            .select('id, text_content, tags, input_method, created_at')
            .eq('client_id', id)
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false }),
        ),
        apiRead((client) =>
          client
            .from('quotes')
            .select('id, reference, status, created_at')
            .eq('client_id', id)
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false }),
        ),
        apiRead((client) =>
          client
            .from('projects')
            .select('id, status, created_at')
            .eq('client_id', id)
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false }),
        ),
        apiRead((client) =>
          client
            .from('invoices')
            .select('amount_ttc, status')
            .eq('client_id', id)
            .eq('owner_id', user.id)
            .in('status', ['sent', 'paid', 'overdue']),
        ),
        apiRead((client) =>
          client
            .from('documents')
            .select('id, name, doc_type, storage_path, created_at')
            .eq('client_id', id)
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false }),
        ),
      ])
    } catch (err) {
      setIsLoading(false)
      setLoadError(err instanceof ApiTimeoutError ? err.message : String(err))
      return
    }

    setIsLoading(false)
    if (error) {
      setLoadError(error.message)
      return
    }
    setClient(data as ClientRecord)
    setForm(toForm(data as ClientRecord))
    setJournalRows((journalData as JournalRow[]) ?? [])
    setNotes((notesData as ClientNoteRow[]) ?? [])
    setQuotesHistory((quotesData as QuoteHistoryRow[]) ?? [])
    setProjectsHistory((projectsData as ProjectHistoryRow[]) ?? [])
    setDocuments((documentsData as DocumentRow[]) ?? [])
    setChantiersCount((projectsData as ProjectHistoryRow[] | null)?.length ?? 0)
    setCaCumulee(
      ((invoicesData as { amount_ttc: number }[] | null) ?? []).reduce(
        (sum, inv) => sum + Number(inv.amount_ttc),
        0,
      ),
    )
  }, [user, id, isNew])

  React.useEffect(() => {
    if (!user) return
    const key = `${user.id}:${id}`
    if (fetchedFor.current === key) return
    fetchedFor.current = key
    load()
  }, [user, id, load])

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (form.email && !EMAIL_RE.test(form.email)) errors.email = 'Format email invalide.'
    if (form.phone && !PHONE_RE.test(form.phone)) errors.phone = 'Format téléphone invalide.'
    if (!form.name.trim()) errors.name = 'Le nom est requis.'
    // SIREN stays optional (many clients are private individuals, not
    // businesses), but when filled it must be a real 9-digit SIREN — this
    // value is printed on issued quotes (supabase/functions/quote-issue),
    // so an invalid value here reaches a real legal document, same gap class
    // just fixed for the artisan's own SIREN in BusinessInfoForm.tsx (module
    // 4 deep audit, 2026-10-07).
    if (form.siren.trim() && !isSirenValid(form.siren)) {
      errors.siren = 'Le SIREN doit contenir exactement 9 chiffres.'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user || savingRef.current) return
    if (!validate()) return

    savingRef.current = true
    setSaveStatus('saving')
    setSaveError(null)

    const payload = {
      owner_id: user.id,
      name: form.name,
      address: { street: form.street, postal_code: form.postalCode, city: form.city },
      phone: form.phone || null,
      email: form.email || null,
      siren: form.siren || null,
      next_followup_reminder: form.nextFollowupReminder || null,
    }

    if (isNew) {
      try {
        const { data, error } = await apiWrite((client) =>
          client.from('clients').insert(payload).select('id').single(),
        )
        if (error) {
          savingRef.current = false
          setSaveStatus('error')
          setSaveError(error.message)
          return
        }
        navigate(`/clients/${data!.id}`, { replace: true })
      } catch (err) {
        savingRef.current = false
        setSaveStatus('error')
        setSaveError(err instanceof ApiTimeoutError ? err.message : String(err))
      }
      return
    }

    try {
      const { error } = await apiWrite((client) =>
        client.from('clients').update(payload).eq('id', id),
      )
      if (error) {
        savingRef.current = false
        setSaveStatus('error')
        setSaveError(error.message)
        return
      }
      savingRef.current = false
      setSaveStatus('idle')
      load()
    } catch (err) {
      savingRef.current = false
      setSaveStatus('error')
      setSaveError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }

  async function handleArchive() {
    if (!id || archivingRef.current) return
    archivingRef.current = true
    setArchiving(true)
    setArchiveError(null)
    // Archiving only ever sets status='archived' — never deletes the row or
    // touches any linked quote/invoice/project (KOV-FR-005 hard requirement,
    // verified explicitly in this step's live testing, not just by inspection).
    try {
      const { error } = await apiWrite((client) =>
        client.from('clients').update({ status: 'archived' }).eq('id', id),
      )
      if (error) {
        archivingRef.current = false
        setArchiving(false)
        setArchiveError(error.message)
        return
      }
    } catch (err) {
      archivingRef.current = false
      setArchiving(false)
      setArchiveError(err instanceof ApiTimeoutError ? err.message : String(err))
      return
    }
    archivingRef.current = false
    setArchiving(false)
    setArchiveConfirmOpen(false)
    navigate('/clients')
  }

  async function handleUploadDocument(file: File) {
    if (!user || !id || uploadingRef.current) return
    uploadingRef.current = true
    setUploading(true)
    setUploadError(null)

    const docType = file.type.startsWith('image/') ? 'upload_photo' : 'upload_file'
    const storagePath = `${user.id}/${docType}/${Date.now()}-${file.name}`

    try {
      // This upload previously had no timeout at all — unlike every other
      // write in this app, which goes through apiWrite's 15s AbortController-
      // based timeout, this called supabase.storage directly, so a genuinely
      // hung upload (bad connection, huge file) would leave "uploading" true
      // indefinitely with no way to recover short of reloading the page.
      // storage-js has no abortSignal upload option in this version, so this
      // can't actually cancel the underlying request — but racing it against
      // a generous timeout still unblocks the UI and lets the artisan retry,
      // which is the real goal (module 4 deep audit, 2026-10-07). Sized well
      // above the 15s API default since file uploads legitimately take
      // longer than a JSON read/write.
      const UPLOAD_TIMEOUT_MS = 60_000
      const uploadResult = await Promise.race([
        supabase.storage.from('documents').upload(storagePath, file),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new ApiTimeoutError("L'envoi du document a pris trop de temps.")),
            UPLOAD_TIMEOUT_MS,
          ),
        ),
      ])
      if (uploadResult.error) {
        setUploadError(uploadResult.error.message)
        return
      }

      const { error: insertError } = await apiWrite((client) =>
        client.from('documents').insert({
          owner_id: user.id,
          client_id: id,
          name: file.name,
          doc_type: docType,
          storage_path: `documents/${storagePath}`,
          mime_type: file.type || null,
          size_bytes: file.size,
        }),
      )
      if (insertError) {
        setUploadError(insertError.message)
        return
      }
      load()
    } catch (err) {
      setUploadError(err instanceof ApiTimeoutError ? err.message : String(err))
    } finally {
      uploadingRef.current = false
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSaveNote() {
    if (!user || !id || !noteText.trim() || noteSavingRef.current) return
    noteSavingRef.current = true
    setNoteSaving(true)
    const tags = noteTagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    let error
    try {
      ;({ error } = await apiWrite((client) =>
        client.from('client_notes').insert({
          owner_id: user.id,
          client_id: id,
          text_content: noteText.trim(),
          tags,
          input_method: noteInputMethod,
        }),
      ))
    } catch (err) {
      noteSavingRef.current = false
      setNoteSaving(false)
      setNoteError(err instanceof ApiTimeoutError ? err.message : String(err))
      return
    }
    noteSavingRef.current = false
    setNoteSaving(false)
    if (error) {
      setNoteError(error.message)
      return
    }
    setNoteText('')
    setNoteTagsInput('')
    setNoteInputMethod('typed')
    setNoteError(null)
    load()
  }

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(!isNew && isLoading)

  if (!isNew && loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <InlineError message={loadError} onRetry={load} />
      </div>
    )
  }

  if (showSkeleton) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
        <Skeleton className="mb-4 h-5 w-20 rounded-xs opacity-75" />
        <Skeleton className="mb-6 h-8 w-64 rounded-xs" />
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <div className="flex flex-col gap-6 lg:w-[380px] lg:shrink-0">
            <div className="grid grid-cols-2 gap-3">
              <SkeletonStatTile />
              <SkeletonStatTile />
            </div>
            <div className="flex flex-col gap-4">
              <SkeletonFormField />
              <SkeletonFormField />
              <div className="grid grid-cols-2 gap-3">
                <SkeletonFormField />
                <SkeletonFormField />
              </div>
              <SkeletonFormField />
              <SkeletonFormField />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={2} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
      <button
        type="button"
        onClick={() => navigate('/clients')}
        className="mb-4 flex w-fit items-center gap-1 text-[13px] font-bold text-text-mid outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg"
      >
        <ArrowLeft size={16} strokeWidth={2.5} />
        Clients
      </button>

      <h1 className="mb-4 font-serif text-[24px] font-black text-text-hi">
        {isNew ? 'Nouveau client' : client?.name}
      </h1>

      {/* Two-pane desktop layout (docs/02_ThemeGuideline.md §4.3's wide-viewport
      spec names this exact screen as an example: "chantier detail + main
      courante side by side" — the client record is the same shape, form on
      the left, the activity-heavy sections on the right, both independently
      scrollable at 1024px+ rather than one long stacked column). Mobile stays
      a single stacked column, unchanged. */}
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex flex-col gap-6 lg:w-[380px] lg:shrink-0">
          {!isNew && client ? (
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Chiffre d'affaires cumulé" value={`${caCumulee.toFixed(2)} €`} />
              <StatTile label="Chantiers" value={chantiersCount} />
              {client.next_followup_reminder ? (
                <StatTile
                  className="col-span-2"
                  label="Prochain rappel de suivi"
                  value={new Date(client.next_followup_reminder + 'T00:00:00').toLocaleDateString(
                    'fr-FR',
                  )}
                />
              ) : null}
            </div>
          ) : null}

          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <Input
              label="Nom"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              error={fieldErrors.name}
            />
            <Input
              label="Adresse"
              value={form.street}
              onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Code postal"
                value={form.postalCode}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
              />
              <Input
                label="Ville"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <Input
              label="Téléphone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              error={fieldErrors.phone}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              error={fieldErrors.email}
            />
            <Input
              label="SIREN"
              value={form.siren}
              onChange={(e) => setForm((f) => ({ ...f, siren: e.target.value }))}
              error={fieldErrors.siren}
            />
            <Input
              label="Prochain rappel de suivi (ex. maintenance)"
              type="date"
              value={form.nextFollowupReminder}
              onChange={(e) => setForm((f) => ({ ...f, nextFollowupReminder: e.target.value }))}
            />

            {saveStatus === 'error' && saveError ? <InlineError message={saveError} /> : null}
            {!isOnline ? (
              <div className="rounded-sm bg-recessed px-3 py-2 text-center text-[12px] font-bold text-text-mid">
                Hors ligne — impossible d'enregistrer tant que la connexion n'est pas rétablie.
              </div>
            ) : null}

            <Button type="submit" variant="primary" disabled={saveStatus === 'saving' || !isOnline}>
              {saveStatus === 'saving' ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </form>

          {!isNew && client?.status === 'active' ? (
            <Button
              variant="ghost"
              className="text-error-text"
              onClick={() => setArchiveConfirmOpen(true)}
            >
              <Archive size={16} strokeWidth={2} />
              Archiver ce client
            </Button>
          ) : null}
        </div>

      {!isNew ? (
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <section>
            <h2 className="mb-2 text-[13px] font-bold tracking-[0.05em] text-text-mid uppercase">
              Documents
            </h2>
            <div className="rounded-sm bg-surface p-4 shadow-raised">
              {documents && documents.length > 0 ? (
                <ul className="mb-3 flex flex-col gap-2">
                  {documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center gap-2 rounded-xs bg-recessed px-3 py-2 text-[12px] text-text-hi"
                    >
                      <FileText size={14} strokeWidth={2} className="shrink-0 text-text-mid" />
                      <span className="min-w-0 flex-1 truncate">{doc.name}</span>
                      <span className="shrink-0 text-[11px] text-text-low">
                        {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-3 text-center text-[13px] text-text-mid">Aucun document</p>
              )}
              {uploadError ? <InlineError message={uploadError} className="mb-3" /> : null}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleUploadDocument(file)
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={!isOnline || uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} strokeWidth={2} />
                {uploading ? 'Envoi...' : 'Ajouter un document'}
              </Button>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-bold tracking-[0.05em] text-text-mid uppercase">
              Main courante
            </h2>
            <div className="rounded-sm bg-surface p-4 shadow-raised">
              <JournalTimeline
                entries={(journalRows ?? []).map((row) => ({
                  id: row.id,
                  type: row.entry_type,
                  direction: row.direction,
                  title: row.title,
                  timestamp: new Date(row.occurred_at).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  onExpand: row.body ? () => setExpandedEntry(row) : undefined,
                }))}
                emptyLabel="Alimentée automatiquement par les devis, factures et relances liés à ce client."
              />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-bold tracking-[0.05em] text-text-mid uppercase">
              Notes internes
            </h2>
            <div className="flex flex-col gap-3 rounded-sm bg-surface p-4 shadow-raised">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
                  Nouvelle note
                </span>
                {noteDictation.isSupported ? (
                  <button
                    type="button"
                    onClick={toggleNoteDictation}
                    aria-label={
                      noteDictation.status === 'listening'
                        ? 'Arrêter la dictée'
                        : 'Démarrer la dictée'
                    }
                    className="relative flex h-11 w-11 items-center justify-center rounded-full bg-recessed text-text-hi outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    <DictationRings active={noteDictation.status === 'listening'} />
                    <Mic
                      size={16}
                      strokeWidth={2}
                      className={`relative z-10 ${noteDictation.status === 'listening' ? 'text-brand-500' : ''}`}
                    />
                  </button>
                ) : null}
              </div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                placeholder="Note libre sur ce client..."
                className="rounded-sm border-[1.5px] border-divider bg-surface p-3 text-[13px] leading-[1.5] text-text-hi outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg"
              />
              <Input
                label="Étiquettes (séparées par des virgules)"
                value={noteTagsInput}
                onChange={(e) => setNoteTagsInput(e.target.value)}
                placeholder="ex : allergique poussière, chien"
              />
              {noteError ? <InlineError message={noteError} /> : null}
              <Button
                variant="primary"
                size="sm"
                disabled={!noteText.trim() || noteSaving || !isOnline}
                onClick={handleSaveNote}
              >
                {noteSaving ? 'Enregistrement...' : 'Ajouter la note'}
              </Button>

              {notes && notes.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-2 border-t border-divider pt-3">
                  {notes.map((note) => (
                    <li key={note.id} className="text-[13px]">
                      <p className="text-text-hi">{note.text_content}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {note.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-pill bg-recessed px-2 py-0.5 text-[10px] font-bold text-text-mid"
                          >
                            {tag}
                          </span>
                        ))}
                        <span className="text-[11px] text-text-low">
                          {new Date(note.created_at).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : notes && notes.length === 0 ? (
                <p className="border-t border-divider pt-3 text-center text-[13px] text-text-mid">
                  Aucune note.
                </p>
              ) : null}
            </div>
          </section>

          <section className="mb-2">
            <h2 className="mb-2 text-[13px] font-bold tracking-[0.05em] text-text-mid uppercase">
              Historique
            </h2>
            {(quotesHistory?.length ?? 0) === 0 && (projectsHistory?.length ?? 0) === 0 ? (
              <div className="rounded-sm bg-surface p-6 text-center shadow-raised">
                <FileText size={28} strokeWidth={1.5} className="mx-auto mb-2 text-text-low" />
                <p className="text-[13px] text-text-mid">Aucun devis ou chantier pour l'instant.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {(quotesHistory ?? []).map((quote) => (
                  <li key={quote.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/quotes/${quote.id}/edit`)}
                      className="flex w-full items-center justify-between gap-3 rounded-sm bg-surface p-3 text-left shadow-raised outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-text-hi">
                        Devis {quote.reference}
                      </span>
                      <span className="shrink-0 text-[11px] text-text-low">
                        {new Date(quote.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    </button>
                  </li>
                ))}
                {(projectsHistory ?? []).map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${project.id}`)}
                      className="flex w-full items-center justify-between gap-3 rounded-sm bg-surface p-3 text-left shadow-raised outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-text-hi">
                        Chantier
                      </span>
                      <span className="shrink-0 text-[11px] text-text-low">
                        {new Date(project.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
      </div>

      {archiveConfirmOpen ? (
        <Modal
          onClose={() => setArchiveConfirmOpen(false)}
          labelledBy="archive-client-modal-title"
          panelClassName="max-w-sm"
        >
          <h2
            id="archive-client-modal-title"
            className="font-serif text-[18px] font-black text-text-hi"
          >
            Archiver ce client ?
          </h2>
          <p className="text-[13px] text-text-mid">
            Le client sera retiré de la liste par défaut. Les devis, factures et chantiers liés
            restent intacts et accessibles.
          </p>
          {archiveError ? <InlineError message={archiveError} /> : null}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              disabled={archiving}
              onClick={() => setArchiveConfirmOpen(false)}
            >
              Annuler
            </Button>
            <Button
              variant="urgent"
              className="flex-1"
              disabled={archiving || !isOnline}
              onClick={handleArchive}
            >
              {archiving ? 'Archivage...' : 'Archiver'}
            </Button>
          </div>
        </Modal>
      ) : null}

      {expandedEntry ? (
        <JournalEntryModal entry={expandedEntry} onClose={() => setExpandedEntry(null)} />
      ) : null}
    </div>
  )
}
