import * as React from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Check, Flame, User, Users } from 'lucide-react'
import { motion } from 'framer-motion'
import { BrandWordmark } from '@/components/ui/BrandWordmark'
import { InlineError } from '@/components/ui/InlineError'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useOwnerRecord } from '@/hooks/useOwnerRecord'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import {
  BusinessInfoForm,
  isLegalFieldsComplete,
  type BusinessInfoValues,
} from './BusinessInfoForm'
import { PLOMBERIE_CHAUFFAGE_SEED } from '@/features/price-library/seedData'
import { notifyOnboardingComplete } from '@/components/ProtectedRoute'
import { cn } from '@/lib/utils'

/**
 * Onboarding — docs/03_MasterPrompts.md §6.2, docs/04_ApplicationFlow.md §2.1.
 *
 * SINGLE unified state machine — trade selection (step 0) -> team size
 * (step 1) -> business info (step 2) -> complete.
 */

const TRADES = [
  {
    value: 'plomberie_chauffage' as const,
    label: 'Plomberie / Chauffage',
    description: 'Installation sanitaire, chaudières, pompes à chaleur, dépannage.',
  },
]

const TEAM_MODES = [
  {
    value: 'solo' as const,
    label: 'Solo',
    description: 'Artisan indépendant, je gère mes chantiers seul.',
  },
  {
    value: 'equipe' as const,
    label: 'Équipe',
    description: 'Entreprise avec salariés, apprentis ou sous-traitants.',
  },
]

export default function OnboardingPage() {
  const { user, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { step: stepParam } = useParams<{ step?: string }>()
  const isOnline = useOnlineStatus()
  const {
    profile,
    business,
    isLoading: recordLoading,
    error: loadError,
    refetch,
  } = useOwnerRecord()

  const [savingStep, setSavingStep] = React.useState<number | null>(null)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!profile) return
    const persisted = String(profile.onboarding_step)
    if (stepParam !== persisted) {
      navigate(`/onboarding/${persisted}`, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.onboarding_step])

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(authLoading || recordLoading)

  if (showSkeleton) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6">
        <div className="flex w-full max-w-md flex-col gap-4">
          <Skeleton className="h-10 w-1/3 rounded-xs" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/sign-in" replace />
  }

  if (loadError || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <InlineError message={loadError ?? 'Impossible de charger ton profil.'} onRetry={refetch} />
      </div>
    )
  }

  if (profile.onboarding_complete) {
    return <Navigate to="/home" replace />
  }

  const currentStep = profile.onboarding_step
  const userId = user.id
  const trade = profile.trade

  async function persistStep(
    stepIndex: number,
    patch: Record<string, unknown>,
  ): Promise<{ error?: string }> {
    if (!isOnline) {
      return {
        error: "Hors ligne — impossible d'enregistrer tant que la connexion n'est pas rétablie.",
      }
    }
    setSavingStep(stepIndex)
    setSaveError(null)

    try {
      const { error } = await apiWrite((client) =>
        client
          .from('profiles')
          .update({ onboarding_step: stepIndex + 1, ...patch })
          .eq('id', userId),
      )

      setSavingStep(null)

      if (error) {
        setSaveError(error.message)
        return { error: error.message }
      }

      refetch()
      return {}
    } catch (err) {
      setSavingStep(null)
      const message = err instanceof ApiTimeoutError ? err.message : "Échec de l'enregistrement."
      setSaveError(message)
      return { error: message }
    }
  }

  async function handleTradeSelect(trade: (typeof TRADES)[number]['value']) {
    const result = await persistStep(0, { trade })
    if (result.error) setSaveError(result.error)
  }

  async function handleTeamModeSelect(teamMode: (typeof TEAM_MODES)[number]['value']) {
    const result = await persistStep(1, { team_mode: teamMode })
    if (result.error) setSaveError(result.error)
  }

  async function handleBusinessInfoSubmit(values: BusinessInfoValues) {
    if (!isOnline) {
      return {
        error: "Hors ligne — impossible d'enregistrer tant que la connexion n'est pas rétablie.",
      }
    }

    const businessPayload = {
      owner_id: userId,
      legal_name: values.legalName,
      siren: values.siren,
      address: { street: values.street, postal_code: values.postalCode, city: values.city },
      phone: values.phone,
      email: values.email || null,
      default_vat_rate: values.defaultVatRate,
      legal_mentions: { text: values.legalMentions },
      legal_fields_complete: isLegalFieldsComplete(values),
    }

    try {
      const { error: businessError } = await apiWrite((client) =>
        client.from('businesses').upsert(businessPayload, { onConflict: 'owner_id' }),
      )

      if (businessError) {
        return { error: businessError.message }
      }

      const { error: profileError } = await apiWrite((client) =>
        client
          .from('profiles')
          .update({ onboarding_step: 3, onboarding_complete: true })
          .eq('id', userId),
      )

      if (profileError) {
        return { error: profileError.message }
      }
    } catch (err) {
      return {
        error: err instanceof ApiTimeoutError ? err.message : "Échec de l'enregistrement.",
      }
    }

    notifyOnboardingComplete()

    if (trade === 'plomberie_chauffage') {
      await seedPriceLibrary(userId, trade)
    }

    navigate('/home', { replace: true })
    return {}
  }

  if (currentStep === 0) {
    return (
      <OnboardingStepShell
        step={1}
        totalSteps={3}
        title="Ton métier"
        subtitle="Kōv optimise tes devis et bibliothèques de prix selon ta spécialité."
      >
        {saveError ? <InlineError message={saveError} onRetry={() => setSaveError(null)} /> : null}
        <div className="flex flex-col gap-3">
          {TRADES.map((t) => (
            <button
              key={t.value}
              type="button"
              disabled={savingStep !== null || !isOnline}
              onClick={() => handleTradeSelect(t.value)}
              className={cn(
                'group relative flex items-start gap-4 rounded-sm border-[1.5px] border-divider/40 bg-surface p-4 text-left shadow-raised transition-all duration-150',
                'hover:border-brand-500 hover:bg-surface-hover active:scale-[0.98]',
                'outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg',
                'disabled:pointer-events-none disabled:opacity-40',
              )}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xs bg-brand-500/15 text-brand-300">
                <Flame size={22} strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-extrabold text-text-hi">
                    {savingStep === 0 ? 'Enregistrement...' : t.label}
                  </span>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border border-brand-500/30 text-brand-300 opacity-0 transition-opacity group-hover:opacity-100">
                    <Check size={13} strokeWidth={3} />
                  </div>
                </div>
                <p className="mt-1 text-[12.5px] leading-[1.45] font-medium text-text-mid">
                  {t.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </OnboardingStepShell>
    )
  }

  if (currentStep === 1) {
    return (
      <OnboardingStepShell
        step={2}
        totalSteps={3}
        title="Ton organisation"
        subtitle="Travailles-tu seul ou avec des collaborateurs sur les chantiers ?"
      >
        {saveError ? <InlineError message={saveError} onRetry={() => setSaveError(null)} /> : null}
        <div className="flex flex-col gap-3">
          {TEAM_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              disabled={savingStep !== null || !isOnline}
              onClick={() => handleTeamModeSelect(mode.value)}
              className={cn(
                'group relative flex items-start gap-4 rounded-sm border-[1.5px] border-divider/40 bg-surface p-4 text-left shadow-raised transition-all duration-150',
                'hover:border-brand-500 hover:bg-surface-hover active:scale-[0.98]',
                'outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg',
                'disabled:pointer-events-none disabled:opacity-40',
              )}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xs bg-brand-500/15 text-brand-300">
                {mode.value === 'solo' ? (
                  <User size={22} strokeWidth={2} />
                ) : (
                  <Users size={22} strokeWidth={2} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-extrabold text-text-hi">
                    {savingStep === 1 ? 'Enregistrement...' : mode.label}
                  </span>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border border-brand-500/30 text-brand-300 opacity-0 transition-opacity group-hover:opacity-100">
                    <Check size={13} strokeWidth={3} />
                  </div>
                </div>
                <p className="mt-1 text-[12.5px] leading-[1.45] font-medium text-text-mid">
                  {mode.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </OnboardingStepShell>
    )
  }

  return (
    <OnboardingStepShell
      step={3}
      totalSteps={3}
      title="Ton entreprise"
      subtitle="Ces informations légales apparaîtront automatiquement sur tes devis et factures."
    >
      <BusinessInfoForm
        initialBusiness={business}
        submitLabel="Terminer la configuration"
        submittingLabel="Enregistrement..."
        onSubmit={handleBusinessInfoSubmit}
      />
    </OnboardingStepShell>
  )
}

async function seedPriceLibrary(ownerId: string, trade: 'plomberie_chauffage') {
  try {
    const { count } = await apiRead((client) =>
      client
        .from('price_items')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId),
    )

    if (count && count > 0) return

    const seed = trade === 'plomberie_chauffage' ? PLOMBERIE_CHAUFFAGE_SEED : []
    if (seed.length === 0) return

    await apiWrite((client) =>
      client.from('price_items').insert(seed.map((item) => ({ ...item, owner_id: ownerId }))),
    )
  } catch (err) {
    console.error('Price library seed failed:', err)
  }
}

function OnboardingStepShell({
  step,
  totalSteps,
  title,
  subtitle,
  children,
}: {
  step: number
  totalSteps: number
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  const headingRef = React.useRef<HTMLHeadingElement>(null)

  // Re-focus the heading on every step change, not just the shell's first
  // mount — found as a genuine pre-existing bug during 16.2's live
  // re-verification (2026-10-03): OnboardingStepShell is one reused
  // component instance across all 3 steps (never unmounts/remounts between
  // them), so an empty dependency array here meant this effect only ever
  // fired once, on step 1 — steps 2 and 3 silently never received focus,
  // violating docs/02_ThemeGuideline.md §10's "full keyboard navigation
  // through every core flow: onboarding" requirement. `step` must be a
  // dependency so this re-runs on every genuine step transition.
  React.useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-x-hidden bg-page-bg p-4 sm:p-6">
      {/* Ambient background treatment — reuses AuthLayout's exact tokens
      (16.2 sub-step, 2026-10-03): onboarding previously used a flat
      `shadow-raised` card with no ambient glow/texture, reading noticeably
      plainer than the sign-in/sign-up/forgot-password screens it sits
      alongside in the same first-impression flow. Never a new color/shadow —
      same brand-500/gold-500 glows and divider-based grid already
      established in AuthLayout.tsx. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      >
        <div className="absolute -top-32 h-[480px] w-[640px] rounded-full bg-brand-500/10 blur-[120px] dark:bg-brand-500/15" />
        <div className="absolute -bottom-24 -right-24 h-[380px] w-[380px] rounded-full bg-gold-500/5 blur-[100px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--divider)_1px,transparent_1px),linear-gradient(to_bottom,var(--divider)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_35%,#000_70%,transparent_100%)] opacity-[0.25] dark:opacity-[0.18]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-lg"
      >
        {/* Brand Wordmark & Step Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandWordmark size="md" />

          {/* 3-segment progress indicator */}
          <div className="mt-4 flex w-36 items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors duration-300',
                  i + 1 <= step ? 'bg-brand-500' : 'bg-divider/30',
                )}
              />
            ))}
          </div>
          <span className="mt-1.5 text-[11px] font-bold tracking-[0.06em] text-text-mid uppercase">
            Étape {step} sur {totalSteps}
          </span>
        </div>

        {/* Form Container — floating elevation + top highlight bar, matching
        AuthLayout's card treatment exactly (same glassmorphic surface
        language, not a new pattern) */}
        <div className="relative overflow-hidden rounded-md border border-divider/40 bg-surface/95 p-6 shadow-floating backdrop-blur-xl sm:p-8">
          <div
            aria-hidden="true"
            className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-brand-500 to-transparent opacity-85"
          />
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="mb-1.5 font-serif text-[24px] font-black text-text-hi outline-none"
          >
            {title}
          </h1>
          <p className="mb-6 text-[13.5px] leading-[1.5] font-medium text-text-mid">{subtitle}</p>
          {children}
        </div>
      </motion.div>
    </div>
  )
}
