import * as React from 'react'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'

type InvoiceType = 'acompte' | 'situation' | 'solde' | 'totalite'
type PaymentTerm = 'a_reception' | '15_jours' | '30_jours'

const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  acompte: 'Acompte (30%)',
  situation: 'Situation (40%)',
  solde: 'Solde',
  totalite: 'Totalité',
}

const PAYMENT_TERM_LABELS: Record<PaymentTerm, string> = {
  a_reception: 'À réception',
  '15_jours': '15 jours',
  '30_jours': '30 jours',
}

const PAYMENT_TERM_DAYS: Record<PaymentTerm, number> = {
  a_reception: 0,
  '15_jours': 15,
  '30_jours': 30,
}

/** docs/03_MasterPrompts.md §11.2 item 1: each invoice type is computed and
 * shown in euros from the source quote's total_ttc — acompte 30%, situation
 * 40%. "solde" is the TRUE remaining balance (total_ttc minus everything
 * already invoiced for this quote, never cancelled), and "totalité" is the
 * full amount minus whatever's already been invoiced too — both previously
 * always showed the FULL total_ttc regardless of prior invoices, so creating
 * an acompte then later a solde invoice for the same quote double-billed the
 * client for up to 130% of the real total. `alreadyInvoiced` is the sum of
 * every non-cancelled invoice already created against this quote (module 9
 * deep audit, 2026-10-07). */
function computeAmount(type: InvoiceType, totalTtc: number, alreadyInvoiced: number): number {
  if (type === 'acompte') return roundCents(totalTtc * 0.3)
  if (type === 'situation') return roundCents(totalTtc * 0.4)
  return roundCents(Math.max(0, totalTtc - alreadyInvoiced))
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

interface InvoiceCreateModalProps {
  quoteId: string
  clientId: string
  projectId?: string | null
  totalTtc: number
  onClose: () => void
  /** `journalWarning` set when the invoice was genuinely created but the
   * non-fatal main-courante auto-feed write failed — surfaced by the caller,
   * which stays mounted after this modal closes (scope audit, 2026-09-26:
   * previously console-only, no user-facing signal at all). */
  onCreated: (invoiceId: string, journalWarning?: string) => void
}

/**
 * mo-facture — docs/04_ApplicationFlow.md §3.2, docs/03_MasterPrompts.md
 * §11.2. Invoice-type + payment-term selection, computed amount shown live.
 * On create: inserts the invoices row (late_penalty_mention=true,
 * recovery_indemnity_eur=40 by column default — never overridden), computes
 * due_date from today + payment term, and auto-feeds the client's journal
 * (main courante) — the FIRST real journal-writing code path in this
 * project, built carefully since Steps 11-14 all depend on this same
 * pattern working correctly.
 */
export function InvoiceCreateModal({
  quoteId,
  clientId,
  projectId,
  totalTtc,
  onClose,
  onCreated,
}: InvoiceCreateModalProps) {
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const [invoiceType, setInvoiceType] = React.useState<InvoiceType>('acompte')
  const [paymentTerm, setPaymentTerm] = React.useState<PaymentTerm>('a_reception')
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  // Sum of every non-cancelled invoice already created for this quote — null
  // while loading, so the amount/warning below never flashes a wrong figure
  // before this resolves. Fetched once per mount (this modal is always
  // remounted fresh per open, never kept alive across quotes).
  const [alreadyInvoiced, setAlreadyInvoiced] = React.useState<number | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  // A ref, not a state check — see SatisfactionPage.tsx's doc comment
  // (module 15 deep audit, 2026-10-08): a state-only guard can still be
  // beaten by two click handlers firing in the same React batch, since
  // neither sees the other's setState until after both have already run.
  const savingRef = React.useRef(false)

  React.useEffect(() => {
    let cancelled = false
    apiRead((client) =>
      client
        .from('invoices')
        .select('amount_ttc')
        .eq('quote_id', quoteId)
        .neq('status', 'cancelled'),
    )
      .then(({ data, error: readError }) => {
        if (cancelled) return
        if (readError) {
          setLoadError(readError.message)
          return
        }
        setAlreadyInvoiced(
          (data ?? []).reduce((sum, row) => sum + Number(row.amount_ttc ?? 0), 0),
        )
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof ApiTimeoutError ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [quoteId])

  const amount = alreadyInvoiced === null ? 0 : computeAmount(invoiceType, totalTtc, alreadyInvoiced)
  const wouldExceedTotal =
    alreadyInvoiced !== null && alreadyInvoiced + amount > totalTtc + 0.01

  async function handleCreate() {
    if (!user || savingRef.current) return
    savingRef.current = true
    setStatus('saving')
    setError(null)

    const issuedAt = new Date().toISOString().slice(0, 10)
    const dueDate = addDays(PAYMENT_TERM_DAYS[paymentTerm])

    let invoice, insertError
    try {
      ;({ data: invoice, error: insertError } = await apiWrite((client) =>
        client
          .from('invoices')
          .insert({
            owner_id: user.id,
            client_id: clientId,
            quote_id: quoteId,
            project_id: projectId ?? null,
            invoice_type: invoiceType,
            amount_ttc: amount,
            payment_term: paymentTerm,
            status: 'sent',
            issued_at: issuedAt,
            due_date: dueDate,
          })
          .select('id')
          .single(),
      ))
    } catch (err) {
      savingRef.current = false
      setStatus('error')
      setError(err instanceof ApiTimeoutError ? err.message : String(err))
      return
    }

    if (insertError || !invoice) {
      savingRef.current = false
      setStatus('error')
      setError(insertError?.message ?? 'Échec de la création de la facture.')
      return
    }

    // Journal auto-feed (main courante) — entry_type='facture',
    // direction='outbound', linked via related_invoice_id. This is the
    // FIRST real journal-writing path in the project (docs/03_MasterPrompts.md
    // §11.2 item 3's explicit note) — every later auto-feed (dunning, agent
    // execution) follows this exact same insert shape.
    let journalWarning: string | undefined
    try {
      const { error: journalError } = await apiWrite((client) =>
        client.from('journal').insert({
          owner_id: user.id,
          client_id: clientId,
          entry_type: 'facture',
          direction: 'outbound',
          title: `Facture ${INVOICE_TYPE_LABELS[invoiceType]} — ${amount.toFixed(2)} €`,
          related_invoice_id: invoice.id,
          related_quote_id: quoteId,
          related_project_id: projectId ?? null,
        }),
      )
      if (journalError) {
        // Non-fatal — the invoice itself is genuinely created and correct;
        // a missing journal entry is a secondary concern, not worth failing
        // the whole creation for after the invoice is already committed
        // (same posture as delete-account's non-fatal quote_events insert).
        // Still surfaced to the caller (see onCreated's doc comment) rather
        // than only console-logged, per the 2026-09-26 scope audit finding.
        console.error('Failed to auto-feed journal on invoice creation:', journalError.message)
        journalWarning =
          "La facture a bien été créée, mais elle n'a pas pu être ajoutée à la main courante."
      }
    } catch (err) {
      // Non-fatal, same posture as above — including a timed-out journal write.
      console.error(
        'Failed to auto-feed journal on invoice creation:',
        err instanceof ApiTimeoutError ? err.message : err,
      )
      journalWarning =
        "La facture a bien été créée, mais elle n'a pas pu être ajoutée à la main courante."
    }

    savingRef.current = false
    setStatus('idle')
    onCreated(invoice.id, journalWarning)
  }

  return (
    <Modal onClose={onClose} labelledBy="invoice-create-modal-title" panelClassName="max-w-sm">
      <h2
        id="invoice-create-modal-title"
        className="font-serif text-[18px] font-black text-text-hi"
      >
        Facturer
      </h2>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
          Type de facture
        </span>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(INVOICE_TYPE_LABELS) as InvoiceType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setInvoiceType(type)}
              className={`rounded-sm border-[1.5px] px-3 py-2.5 text-[12px] font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                invoiceType === type
                  ? 'border-brand-500 bg-brand-700 text-white shadow-xs'
                  : 'border-divider bg-surface text-text-hi hover:border-border-hover hover:bg-surface-hover'
              }`}
            >
              {INVOICE_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
          Délai de paiement
        </span>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(PAYMENT_TERM_LABELS) as PaymentTerm[]).map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => setPaymentTerm(term)}
              className={`rounded-sm border-[1.5px] px-2 py-2.5 text-[11px] font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                paymentTerm === term
                  ? 'border-brand-500 bg-brand-700 text-white shadow-xs'
                  : 'border-divider bg-surface text-text-hi hover:border-border-hover hover:bg-surface-hover'
              }`}
            >
              {PAYMENT_TERM_LABELS[term]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-divider/60 bg-recessed p-3.5">
        <span className="text-[13px] font-bold text-text-mid">Montant à facturer</span>
        <span className="font-mono tabular-nums text-[20px] font-black text-text-hi">
          {alreadyInvoiced === null ? '…' : `${amount.toFixed(2)} €`}
        </span>
      </div>

      {alreadyInvoiced !== null && alreadyInvoiced > 0 ? (
        <p className="text-[11px] text-text-low">
          {alreadyInvoiced.toFixed(2)} € déjà facturé sur ce devis ({totalTtc.toFixed(2)} € au
          total).
        </p>
      ) : null}

      {wouldExceedTotal ? (
        <InlineError message="Cette facture dépasserait le montant total du devis — vérifie les factures déjà créées pour ce devis avant de continuer." />
      ) : null}

      {loadError ? <InlineError message={loadError} /> : null}

      <p className="text-[11px] text-text-low">
        Pénalités de retard et indemnité forfaitaire de recouvrement de 40 € mentionnées
        automatiquement.
      </p>

      {status === 'error' && error ? <InlineError message={error} /> : null}

      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose}>
          Annuler
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={
            status === 'saving' ||
            !isOnline ||
            alreadyInvoiced === null ||
            !!loadError ||
            wouldExceedTotal
          }
          onClick={handleCreate}
        >
          {status === 'saving' ? 'Création...' : 'Créer la facture'}
        </Button>
      </div>
    </Modal>
  )
}
