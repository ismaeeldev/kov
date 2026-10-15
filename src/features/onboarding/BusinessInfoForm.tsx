import * as React from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InlineError } from '@/components/ui/InlineError'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import type { BusinessRow } from '@/hooks/useOwnerRecord'
import { cn } from '@/lib/utils'

export interface BusinessInfoValues {
  legalName: string
  siren: string
  street: string
  postalCode: string
  city: string
  phone: string
  email: string
  defaultVatRate: number
  legalMentions: string
}

const VAT_RATES = [0, 5.5, 10, 20] as const

function toFormValues(business: BusinessRow | null): BusinessInfoValues {
  return {
    legalName: business?.legal_name ?? '',
    siren: business?.siren ?? '',
    street: business?.address?.street ?? '',
    postalCode: business?.address?.postal_code ?? '',
    city: business?.address?.city ?? '',
    phone: business?.phone ?? '',
    email: business?.email ?? '',
    defaultVatRate: business?.default_vat_rate ?? 20,
    legalMentions: business?.legal_mentions?.text ?? '',
  }
}

/** A French SIREN is always exactly 9 digits (INSEE business identifier) —
 * spaces are a common, harmless typing convention ("123 456 789") and are
 * stripped before checking. Previously only checked for a non-empty string,
 * so a single stray character would pass isLegalFieldsComplete() and let an
 * invalid identifier reach real quotes/invoices sent to clients (module 1
 * E2E audit, 2026-10-07). */
export function isSirenValid(siren: string): boolean {
  return /^\d{9}$/.test(siren.replace(/\s/g, ''))
}

/** A field is "complete" once every legally-required entry is filled AND
 * correctly formatted — see docs/04_ApplicationFlow.md §2.1's "legal fields
 * must be validated complete before any quote can later be issued" rule.
 * Address/phone/SIREN/legal mentions are the fields that matter for that
 * gate; email is contact convenience, not a legal requirement, so it is
 * intentionally excluded here. */
export function isLegalFieldsComplete(values: BusinessInfoValues): boolean {
  return !!(
    values.legalName.trim() &&
    isSirenValid(values.siren) &&
    values.street.trim() &&
    values.postalCode.trim() &&
    values.city.trim() &&
    values.phone.trim() &&
    values.legalMentions.trim()
  )
}

interface BusinessInfoFormProps {
  initialBusiness: BusinessRow | null
  submitLabel: string
  submittingLabel: string
  onSubmit: (values: BusinessInfoValues) => Promise<{ error?: string }>
}

/**
 * The business-info field set — docs/03_MasterPrompts.md §6.2 item 1/7:
 * shared verbatim between the onboarding flow's final step and the
 * post-onboarding /profile/business edit screen.
 */
export function BusinessInfoForm({
  initialBusiness,
  submitLabel,
  submittingLabel,
  onSubmit,
}: BusinessInfoFormProps) {
  const isOnline = useOnlineStatus()
  const [values, setValues] = React.useState<BusinessInfoValues>(() =>
    toFormValues(initialBusiness),
  )
  const [status, setStatus] = React.useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  // A ref, not a state check — a state-only guard doesn't actually prevent a
  // genuine same-tick double-click (see SatisfactionPage.tsx's doc comment,
  // module 15 deep audit, 2026-10-08). This component is shared by both
  // OnboardingPage and BusinessSettingsPage, so fixing it here protects both
  // call sites (module 19 deep audit, 2026-10-08).
  const submittingRef = React.useRef(false)

  function set<K extends keyof BusinessInfoValues>(key: K, value: BusinessInfoValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setStatus('submitting')
    setErrorMessage(null)

    const result = await onSubmit(values)

    if (result.error) {
      submittingRef.current = false
      setStatus('error')
      setErrorMessage(result.error)
      return
    }

    submittingRef.current = false
    setStatus('idle')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4.5">
      {!isOnline ? (
        <div className="rounded-sm bg-recessed px-3.5 py-2.5 text-center text-[12px] font-bold text-text-mid">
          Hors ligne — impossible d'enregistrer tant que la connexion n'est pas rétablie.
        </div>
      ) : null}

      <Input
        label="Raison sociale"
        placeholder="ex. Martin Plomberie EURL"
        required
        value={values.legalName}
        onChange={(e) => set('legalName', e.target.value)}
        disabled={status === 'submitting'}
      />
      <Input
        label="SIREN"
        placeholder="9 chiffres (ex. 123 456 789)"
        required
        inputMode="numeric"
        value={values.siren}
        onChange={(e) => set('siren', e.target.value)}
        disabled={status === 'submitting'}
        error={
          values.siren.trim() && !isSirenValid(values.siren)
            ? 'Le SIREN doit contenir exactement 9 chiffres.'
            : undefined
        }
      />
      <Input
        label="Adresse"
        placeholder="Numéro et voie"
        required
        value={values.street}
        onChange={(e) => set('street', e.target.value)}
        disabled={status === 'submitting'}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Code postal"
          placeholder="75001"
          required
          inputMode="numeric"
          value={values.postalCode}
          onChange={(e) => set('postalCode', e.target.value)}
          disabled={status === 'submitting'}
        />
        <Input
          label="Ville"
          placeholder="Paris"
          required
          value={values.city}
          onChange={(e) => set('city', e.target.value)}
          disabled={status === 'submitting'}
        />
      </div>
      <Input
        label="Téléphone"
        placeholder="06 12 34 56 78"
        type="tel"
        required
        value={values.phone}
        onChange={(e) => set('phone', e.target.value)}
        disabled={status === 'submitting'}
      />
      <Input
        label="Email professionnel"
        placeholder="contact@martin-plomberie.fr"
        type="email"
        value={values.email}
        onChange={(e) => set('email', e.target.value)}
        disabled={status === 'submitting'}
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] leading-[1.4] font-bold tracking-[0.05em] text-text-mid uppercase">
          TVA appliquée par défaut
        </label>
        <div className="grid grid-cols-4 gap-2">
          {VAT_RATES.map((rate) => (
            <button
              key={rate}
              type="button"
              disabled={status === 'submitting'}
              onClick={() => set('defaultVatRate', rate)}
              className={cn(
                'h-11 flex-1 rounded-sm border-[1.5px] text-[14px] font-bold transition-all duration-150',
                'outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg',
                'disabled:opacity-40 disabled:pointer-events-none',
                values.defaultVatRate === rate
                  ? 'border-brand-500 bg-brand-700 text-white shadow-sm'
                  : 'border-divider bg-surface text-text-hi hover:border-brand-500/40 hover:bg-recessed active:scale-[0.98]',
              )}
            >
              {rate}%
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="legal-mentions"
          className="text-[11px] leading-[1.4] font-bold tracking-[0.05em] text-text-mid uppercase"
        >
          Mentions légales obligatoires
        </label>
        <textarea
          id="legal-mentions"
          required
          rows={4}
          placeholder="ex. Assurance décennale souscrite auprès de... N° police..."
          value={values.legalMentions}
          onChange={(e) => set('legalMentions', e.target.value)}
          disabled={status === 'submitting'}
          className={cn(
            'w-full rounded-sm border-[1.5px] border-divider bg-surface px-4 py-3 text-[14px] leading-[1.5] text-text-hi placeholder:text-text-low',
            'outline-none transition-all duration-150',
            'hover:border-brand-500/40 focus:border-brand-500',
            'focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg',
            'disabled:pointer-events-none disabled:opacity-40 disabled:bg-recessed',
          )}
        />
      </div>

      {status === 'error' && errorMessage ? <InlineError message={errorMessage} /> : null}

      <Button
        type="submit"
        variant="primary"
        disabled={status === 'submitting' || !isOnline}
        className="mt-2 w-full shadow-accent-glow"
      >
        {status === 'submitting' ? submittingLabel : submitLabel}
      </Button>
    </form>
  )
}
