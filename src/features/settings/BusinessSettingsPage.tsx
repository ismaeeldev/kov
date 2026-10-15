import * as React from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Building2, ChevronRight, Mail, Receipt, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useOwnerRecord } from '@/hooks/useOwnerRecord'
import { apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import {
  BusinessInfoForm,
  isLegalFieldsComplete,
  type BusinessInfoValues,
} from '@/features/onboarding/BusinessInfoForm'
import { SupplierConnectionModal } from '@/features/orders/SupplierConnectionModal'

/**
 * Business Settings (s-entreprise) — docs/03_MasterPrompts.md §6.2 item 7:
 * post-onboarding edits, reusing the EXACT same field components as the
 * onboarding flow's business-info step (BusinessInfoForm), never a second
 * hand-rolled copy of these fields.
 */
export default function BusinessSettingsPage() {
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const { profile, business, isLoading, error, refetch } = useOwnerRecord()
  const [supplierModalOpen, setSupplierModalOpen] = React.useState(false)
  const [accountantEmail, setAccountantEmail] = React.useState('')
  const [accountantEmailInitialized, setAccountantEmailInitialized] = React.useState(false)
  const [accountantEmailStatus, setAccountantEmailStatus] = React.useState<
    'idle' | 'saving' | 'error'
  >('idle')
  const [accountantEmailError, setAccountantEmailError] = React.useState<string | null>(null)
  // A ref, not a state check — see SatisfactionPage.tsx's doc comment
  // (module 15 deep audit, 2026-10-08). Low stakes here (an idempotent field
  // update), but kept consistent (module 19 deep audit, 2026-10-08).
  const savingAccountantEmailRef = React.useRef(false)

  // Seed the local draft from the loaded business row exactly once
  if (business && !accountantEmailInitialized) {
    setAccountantEmailInitialized(true)
    setAccountantEmail(business.accountant_email ?? '')
  }

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(isLoading)

  if (showSkeleton) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-3xl flex-col p-4 sm:p-6">
        <Skeleton className="mb-4 h-4 w-16 rounded-xs" />
        <Skeleton className="mb-1 h-8 w-56 rounded-xs" />
        <Skeleton className="mb-6 h-3.5 w-72 rounded-xs opacity-70" />
        <div className="flex flex-col gap-6">
          <div className="rounded-md border border-divider/30 bg-surface/90 p-5 shadow-raised">
            <Skeleton className="mb-3 h-4 w-32 rounded-xs" />
            <Skeleton className="h-10 w-full rounded-sm" />
          </div>
          <div className="rounded-md border border-divider/30 bg-surface/90 p-5 shadow-raised">
            <Skeleton className="mb-4 h-5 w-44 rounded-xs" />
            <div className="flex flex-col gap-4">
              <Skeleton className="h-11 w-full rounded-sm" />
              <Skeleton className="h-11 w-full rounded-sm" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-11 w-full rounded-sm" />
                <Skeleton className="h-11 w-full rounded-sm" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !profile || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <InlineError message={error ?? 'Impossible de charger ton profil.'} onRetry={refetch} />
      </div>
    )
  }

  async function handleSubmit(values: BusinessInfoValues) {
    if (!isOnline) {
      return {
        error: "Hors ligne — impossible d'enregistrer tant que la connexion n'est pas rétablie.",
      }
    }

    const legalFieldsComplete = isLegalFieldsComplete(values)

    try {
      const { error: businessError } = await apiWrite((client) =>
        client.from('businesses').upsert(
          {
            owner_id: user!.id,
            legal_name: values.legalName,
            siren: values.siren,
            address: { street: values.street, postal_code: values.postalCode, city: values.city },
            phone: values.phone,
            email: values.email || null,
            default_vat_rate: values.defaultVatRate,
            legal_mentions: { text: values.legalMentions },
            legal_fields_complete: legalFieldsComplete,
          },
          { onConflict: 'owner_id' },
        ),
      )

      if (businessError) {
        return { error: businessError.message }
      }

      refetch()
      return {}
    } catch (err) {
      return {
        error: err instanceof ApiTimeoutError ? err.message : 'Une erreur est survenue.',
      }
    }
  }

  async function handleSaveAccountantEmail() {
    if (!isOnline || !business || savingAccountantEmailRef.current) return
    savingAccountantEmailRef.current = true
    setAccountantEmailStatus('saving')
    setAccountantEmailError(null)
    try {
      const { error: saveError } = await apiWrite((client) =>
        client
          .from('businesses')
          .update({ accountant_email: accountantEmail.trim() || null })
          .eq('owner_id', user!.id),
      )
      if (saveError) {
        savingAccountantEmailRef.current = false
        setAccountantEmailStatus('error')
        setAccountantEmailError(saveError.message)
        return
      }
      savingAccountantEmailRef.current = false
      setAccountantEmailStatus('idle')
      refetch()
    } catch (err) {
      savingAccountantEmailRef.current = false
      setAccountantEmailStatus('error')
      setAccountantEmailError(err instanceof ApiTimeoutError ? err.message : 'Une erreur est survenue.')
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-3xl flex-col p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="font-serif text-[24px] sm:text-[28px] font-black tracking-tight text-text-hi">
          Informations entreprise
        </h1>
        <p className="mt-1 text-[13px] text-text-mid">
          Ces coordonnées et mentions légales apparaissent sur l'ensemble de tes devis et factures.
        </p>
      </div>

      {business && !business.legal_fields_complete ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-error/30 bg-error-bg p-4 text-[12.5px] text-error-text">
          <AlertTriangle size={18} strokeWidth={2} className="mt-0.5 shrink-0" />
          <span>
            <strong>Champs légaux incomplets :</strong> un devis ne pourra pas être validé ni émis tant que le nom juridique, le numéro SIRET, l'adresse et le téléphone ne sont pas renseignés.
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        {/* Main Business Form Card */}
        <div className="rounded-2xl border border-divider/60 bg-surface p-5 sm:p-6 shadow-sm">
          <BusinessInfoForm
            initialBusiness={business}
            submitLabel="Enregistrer les modifications"
            submittingLabel="Enregistrement en cours..."
            onSubmit={handleSubmit}
          />
        </div>

        {/* Team and Supplier Quick Links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to="/profile/team"
            className="group flex items-center justify-between gap-3 rounded-xl border border-divider/60 bg-surface p-4 shadow-sm hover:border-brand-500/40 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400">
                <Users size={18} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-extrabold text-text-hi group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                  Gérer l'équipe
                </p>
                <p className="text-[11.5px] text-text-mid truncate">
                  Collaborateurs & plannings
                </p>
              </div>
            </div>
            <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-text-low group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <button
            type="button"
            onClick={() => setSupplierModalOpen(true)}
            className="group flex items-center justify-between gap-3 rounded-xl border border-divider/60 bg-surface p-4 text-left shadow-sm hover:border-brand-500/40 hover:shadow-md transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-recessed text-text-mid group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                <Building2 size={18} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-extrabold text-text-hi group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors truncate">
                  Fournisseur par défaut
                </p>
                <p className="text-[11.5px] text-text-mid truncate">
                  {business?.default_supplier_name || 'Non configuré'}
                </p>
              </div>
            </div>
            <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-text-low group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Accountant Email Card */}
        <div className="rounded-2xl border border-divider/60 bg-surface p-5 sm:p-6 shadow-sm flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Receipt size={18} strokeWidth={2} className="text-brand-500" />
            <h2 className="text-[14px] font-extrabold text-text-hi">
              Destinataire comptable
            </h2>
          </div>
          <p className="text-[12px] text-text-mid">
            Adresse email utilisée par le raccourci d'envoi automatique de l'export comptable trimestriel.
          </p>

          <Input
            type="email"
            placeholder="cabinet-comptable@exemple.fr"
            value={accountantEmail}
            onChange={(e) => setAccountantEmail(e.target.value)}
          />

          {!business ? (
            <p className="text-[11.5px] font-bold text-error-text">
              Renseigne d'abord les informations de ton entreprise ci-dessus avant de pouvoir enregistrer l'email de ton comptable.
            </p>
          ) : null}

          {accountantEmailStatus === 'error' && accountantEmailError ? (
            <InlineError message={accountantEmailError} onRetry={handleSaveAccountantEmail} />
          ) : null}

          <Button
            variant="ghost"
            disabled={accountantEmailStatus === 'saving' || !isOnline || !business}
            onClick={handleSaveAccountantEmail}
            className="w-full sm:w-auto self-end border border-divider/60 font-bold text-xs gap-1.5 shadow-xs"
          >
            <Mail size={14} strokeWidth={2} />
            {accountantEmailStatus === 'saving' ? 'Enregistrement...' : "Enregistrer l'email comptable"}
          </Button>
        </div>
      </div>

      {supplierModalOpen ? (
        <SupplierConnectionModal
          onClose={() => setSupplierModalOpen(false)}
          onSaved={() => {
            setSupplierModalOpen(false)
            refetch()
          }}
        />
      ) : null}
    </div>
  )
}

