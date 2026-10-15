import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InlineError } from '@/components/ui/InlineError'
import { Modal } from '@/components/ui/Modal'
import { SendGuardBanner } from '@/components/ui/SendGuardBanner'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { calculateMonthlyPayment } from '@/lib/calc/financingSimulation'
import { apiWrite, ApiTimeoutError } from '@/lib/apiClient'

type Partner = 'eco_ptz' | 'domofinance' | 'franfinance' | 'sofinco'

const PARTNER_LABELS: Record<Partner, string> = {
  eco_ptz: 'éco-PTZ',
  domofinance: 'Domofinance',
  franfinance: 'Franfinance',
  sofinco: 'Sofinco',
}

// Illustrative example rates only — clearly labeled as such everywhere they
// appear, NEVER presented as real current partner rates (docs/03_MasterPrompts.md
// §13.8 item 3's explicit instruction) — until a future real partner-rate
// data integration exists.
const ILLUSTRATIVE_RATES: Record<Partner, number> = {
  eco_ptz: 0,
  domofinance: 4.9,
  franfinance: 5.9,
  sofinco: 6.9,
}

interface ClientOption {
  id: string
  name: string
}

interface FinancingModalProps {
  clients: ClientOption[]
  onClose: () => void
  /** `journalWarning` set when the simulation was genuinely saved but the
   * non-fatal main-courante auto-feed write failed — surfaced by the caller,
   * which stays mounted after this modal closes (scope audit, 2026-09-26). */
  onSaved: (journalWarning?: string) => void
}

/**
 * mo-financement — docs/03_MasterPrompts.md §13.8 item 2,
 * docs/04_ApplicationFlow.md §2.16. Partner selection, amount/term inputs,
 * a real deterministic computed monthly payment, prominent indicative-only
 * disclosure repeated here too, send-to-client action gated by
 * SendGuardBanner.
 */
export function FinancingModal({ clients, onClose, onSaved }: FinancingModalProps) {
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const [clientId, setClientId] = React.useState(clients[0]?.id ?? '')
  const [partner, setPartner] = React.useState<Partner>('domofinance')
  const [amount, setAmount] = React.useState('5000')
  const [termMonths, setTermMonths] = React.useState('36')
  const [ratePct, setRatePct] = React.useState(String(ILLUSTRATIVE_RATES.domofinance))
  const [confirming, setConfirming] = React.useState(false)
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)

  function handlePartnerChange(p: Partner) {
    setPartner(p)
    setRatePct(String(ILLUSTRATIVE_RATES[p]))
  }

  const monthlyPayment = calculateMonthlyPayment({
    amount: Number(amount) || 0,
    termMonths: Number(termMonths) || 0,
    ratePctAnnual: Number(ratePct) || 0,
  })

  async function handleSend() {
    // Re-entrancy guard — same gap class fixed across this session (module
    // 14 deep audit, 2026-10-07): `disabled` alone only takes effect after
    // React re-renders, so a rapid double-click could otherwise create two
    // real financing_simulations rows for one click.
    if (!user || !clientId || status === 'saving') return
    setStatus('saving')
    setError(null)

    let sim, insertError
    try {
      ;({ data: sim, error: insertError } = await apiWrite((client) =>
        client
          .from('financing_simulations')
          .insert({
            owner_id: user.id,
            client_id: clientId,
            partner,
            amount: Number(amount),
            term_months: Number(termMonths),
            rate_pct: Number(ratePct),
            monthly_payment: monthlyPayment,
            indicative_only: true,
            sent_to_client: true,
          })
          .select('id')
          .single(),
      ))
    } catch (err) {
      setStatus('error')
      setError(err instanceof ApiTimeoutError ? err.message : String(err))
      return
    }

    if (insertError || !sim) {
      setStatus('error')
      setError(insertError?.message ?? 'Échec de la simulation.')
      return
    }

    let journalWarning: string | undefined
    try {
      const { error: journalError } = await apiWrite((client) =>
        client.from('journal').insert({
          owner_id: user.id,
          client_id: clientId,
          entry_type: 'note',
          direction: 'outbound',
          title: `Simulation de financement — ${PARTNER_LABELS[partner]}`,
          body: `Simulation indicative : ${amount} € sur ${termMonths} mois, mensualité estimée à ${monthlyPayment.toFixed(2)} € (${PARTNER_LABELS[partner]}). Simulation indicative, ne constitue pas une offre.`,
        }),
      )
      if (journalError) {
        // Non-fatal — the simulation itself is genuinely created; a missing
        // journal entry is a secondary concern. Still surfaced to the caller
        // (see onSaved's doc comment) rather than only console-logged, per
        // the 2026-09-26 scope audit finding.
        console.error('Failed to auto-feed journal on financing send:', journalError.message)
        journalWarning =
          "La simulation a bien été enregistrée, mais elle n'a pas pu être ajoutée à la main courante."
      }
    } catch (err) {
      console.error(
        'Failed to auto-feed journal on financing send:',
        err instanceof ApiTimeoutError ? err.message : err,
      )
      journalWarning =
        "La simulation a bien été enregistrée, mais elle n'a pas pu être ajoutée à la main courante."
    }

    setStatus('idle')
    onSaved(journalWarning)
  }

  return (
    <Modal onClose={onClose} labelledBy="financing-modal-title" panelClassName="max-w-md">
      <h2 id="financing-modal-title" className="font-serif text-[20px] font-black text-text-hi">
        Simulation de financement
      </h2>

      <div className="flex items-start gap-2.5 rounded-xl border border-gold-400/50 bg-gold-100 p-3.5 text-[12.5px] font-bold text-gold-tint-text">
        <AlertTriangle size={18} strokeWidth={2.2} className="mt-0.5 shrink-0 text-gold-600" />
        <span className="leading-snug">
          Simulation indicative — taux d'exemple, pas les taux réels du partenaire.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-extrabold tracking-wider text-text-mid uppercase">
          Client
        </label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="h-11 rounded-sm border-[1.5px] border-divider bg-surface px-3 text-[14px] text-text-hi outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-extrabold tracking-wider text-text-mid uppercase">
          Partenaire
        </span>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(PARTNER_LABELS) as Partner[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handlePartnerChange(p)}
              className={`rounded-xl border-[1.5px] px-3.5 py-2.5 text-[12.5px] font-extrabold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                partner === p
                  ? 'border-brand-500 bg-brand-700 text-white shadow-sm'
                  : 'border-divider/70 bg-surface text-text-hi hover:bg-recessed'
              }`}
            >
              {PARTNER_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Input
          label="Montant (€)"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input
          label="Durée (mois)"
          type="number"
          value={termMonths}
          onChange={(e) => setTermMonths(e.target.value)}
        />
        <Input
          label="Taux (%) exemple"
          type="number"
          step="0.1"
          value={ratePct}
          onChange={(e) => setRatePct(e.target.value)}
        />
      </div>

      <div className="flex items-baseline justify-between rounded-xl border border-divider/60 bg-recessed p-4 shadow-xs">
        <span className="text-[13px] font-bold text-text-mid">Mensualité estimée</span>
        <span className="font-mono text-[20px] font-black tabular-nums text-brand-300">
          {monthlyPayment.toFixed(2)} €
        </span>
      </div>

      {status === 'error' && error ? <InlineError message={error} /> : null}

      {confirming ? (
        <SendGuardBanner
          onCancel={() => setConfirming(false)}
          onConfirm={handleSend}
          confirmLabel={status === 'saving' ? 'Envoi...' : 'Envoyer au client'}
          confirmDisabled={status === 'saving' || !isOnline}
        />
      ) : (
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={!clientId}
            onClick={() => setConfirming(true)}
          >
            Envoyer au client
          </Button>
        </div>
      )}
    </Modal>
  )
}
