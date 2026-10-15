import * as React from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Loader2, Mail, MailCheck, RotateCcw, WifiOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { supabase } from '@/lib/supabase'

/**
 * Forgot Password — Lavish password recovery screen.
 * States: idle / submitting / error / sent.
 */
export default function ForgotPasswordPage() {
  const isOnline = useOnlineStatus()
  const [email, setEmail] = React.useState('')
  const [status, setStatus] = React.useState<'idle' | 'submitting' | 'error' | 'sent'>('idle')
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [resendSuccess, setResendSuccess] = React.useState(false)
  // Separate from `status` — reusing `status === 'submitting'` here used to
  // flip the `status === 'sent'` check below to false mid-resend, which
  // unmounted this entire confirmation screen (including the resend button
  // itself) back to the original email-entry form for the duration of the
  // request, then jumped back once it resolved. Found via module 1 (auth)
  // E2E audit, 2026-10-07.
  const [isResending, setIsResending] = React.useState(false)
  const [resendError, setResendError] = React.useState<string | null>(null)
  // Refs, not the adjacent state checks alone — see SatisfactionPage.tsx's
  // doc comment (module 15 deep audit, 2026-10-08). Without these a
  // same-tick double-click could call resetPasswordForEmail() twice, sending
  // two reset emails (module 20 close-out sweep, 2026-10-15).
  const submittingRef = React.useRef(false)
  const resendingRef = React.useRef(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isOnline || submittingRef.current) return
    submittingRef.current = true

    setStatus('submitting')
    setErrorMessage(null)
    setResendSuccess(false)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/sign-in`,
    })

    if (error) {
      submittingRef.current = false
      setStatus('error')
      setErrorMessage(
        error.message === 'email rate limit exceeded'
          ? 'Trop de tentatives. Réessaie dans quelques minutes.'
          : error.message === 'Failed to fetch' || error.message.includes('fetch')
            ? 'Impossible de joindre le serveur. Vérifie ta connexion internet.'
            : error.message,
      )
      return
    }

    setStatus('sent')
  }

  const isSubmitting = status === 'submitting'

  if (status === 'sent') {
    return (
      <AuthLayout
        title="Vérifie ta boîte mail"
        subtitle="Un lien de réinitialisation sécurisé vient d'être expédié."
        tagline="Récupération du mot de passe"
        showTrustBadges={false}
      >
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-brand-500/15 text-brand-300 shadow-accent-glow">
            <div className="absolute inset-0 animate-ping rounded-full bg-brand-500/10" />
            <MailCheck size={38} strokeWidth={2.25} />
          </div>

          <div className="mb-5 w-full rounded-sm border border-divider/30 bg-recessed/80 px-4 py-3 text-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-low">
              Email destinataire
            </span>
            <p className="mt-0.5 font-mono text-[14.5px] font-bold text-text-hi break-all">{email}</p>
          </div>

          <p className="text-[13.5px] leading-[1.6] font-medium text-text-mid">
            Si un compte existe pour cette adresse, tu vas recevoir un email contenant un lien valable
            pour réinitialiser ton mot de passe.
          </p>

          {resendSuccess && (
            <div className="mt-4 rounded-sm bg-success-bg/15 border border-success/30 px-3.5 py-2 text-[12.5px] font-bold text-success-text">
              Nouveau lien expédié avec succès !
            </div>
          )}

          {resendError && (
            <div className="mt-4 flex items-start gap-2 rounded-sm border border-error/30 bg-error-bg/15 px-3.5 py-2 text-left text-[12.5px] font-medium text-error-text">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-error" />
              <span className="flex-1">{resendError}</span>
            </div>
          )}

          <div className="mt-6 flex w-full flex-col gap-3">
            <Button asChild variant="primary" className="w-full shadow-accent-glow">
              <Link to="/sign-in" className="inline-flex items-center justify-center gap-2">
                <ArrowLeft size={16} />
                Retour à la connexion
              </Link>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isResending || !isOnline}
              onClick={async () => {
                if (resendingRef.current) return
                resendingRef.current = true
                setIsResending(true)
                setResendSuccess(false)
                setResendError(null)
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/sign-in`,
                })
                resendingRef.current = false
                setIsResending(false)
                if (!error) {
                  setResendSuccess(true)
                } else {
                  setResendError(
                    error.message === 'email rate limit exceeded'
                      ? 'Trop de tentatives. Réessaie dans quelques minutes.'
                      : error.message,
                  )
                }
              }}
              className="text-text-mid hover:text-text-hi"
            >
              <RotateCcw size={14} className={isResending ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
              {isResending ? 'Envoi en cours...' : 'Renvoyer un lien'}
            </Button>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Mot de passe oublié"
      subtitle="Indique ton adresse email pour recevoir un lien de réinitialisation sécurisé."
      tagline="Récupération de compte"
    >
      {!isOnline && (
        <div
          role="status"
          className="mb-5 flex items-center gap-3 rounded-sm border border-urgence-500/30 bg-urgence-500/10 p-3.5 text-[12.5px] font-semibold text-urgence-300"
        >
          <WifiOff size={18} className="shrink-0 text-urgence-500" />
          <span>Hors ligne — cette action nécessite une connexion internet active.</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {status === 'error' && errorMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-sm border border-error/30 bg-error-bg/15 p-3.5 text-[13px] font-medium text-error-text"
          >
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-error" />
            <div className="flex-1 leading-snug">{errorMessage}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4.5">
        <Input
          type="email"
          label="Email"
          autoComplete="email"
          placeholder="artisan@exemple.fr"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting || !isOnline}
          leftIcon={<Mail size={17} />}
        />

        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting || !isOnline}
          className="mt-2 w-full shadow-accent-glow active:scale-[0.98] transition-transform"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={18} className="animate-spin text-white" />
              Envoi en cours...
            </span>
          ) : (
            'Envoyer le lien de réinitialisation'
          )}
        </Button>
      </form>

      <div className="mt-7 flex flex-col items-center border-t border-divider/20 pt-5 text-[13px]">
        <Link
          to="/sign-in"
          className="inline-flex items-center gap-1.5 font-bold text-brand-300 transition-colors hover:text-brand-500 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:rounded-xs"
        >
          <ArrowLeft size={15} />
          Retour à la connexion
        </Link>
      </div>
    </AuthLayout>
  )
}
