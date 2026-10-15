import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  WifiOff,
  XCircle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/**
 * Sign Up — Lavish, ultra-modern registration screen.
 * States: idle / submitting / error / verification-required.
 */
export default function SignUpPage() {
  const isOnline = useOnlineStatus()

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)
  const [status, setStatus] = React.useState<
    'idle' | 'submitting' | 'error' | 'verification-required'
  >('idle')
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  // A ref, not the `status` state check alone — see SatisfactionPage.tsx's
  // doc comment (module 15 deep audit, 2026-10-08). Without it a same-tick
  // double-click could call signUp() twice, sending two confirmation emails
  // (module 20 close-out sweep, 2026-10-15).
  const submittingRef = React.useRef(false)

  // Live password validation indicators
  const isLengthValid = password.length >= 8
  const isMatchValid = password.length > 0 && password === confirmPassword

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isOnline || submittingRef.current) return

    if (password !== confirmPassword) {
      setStatus('error')
      setErrorMessage('Les mots de passe ne correspondent pas.')
      return
    }
    if (password.length < 8) {
      setStatus('error')
      setErrorMessage('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }

    submittingRef.current = true
    setStatus('submitting')
    setErrorMessage(null)

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      submittingRef.current = false
      setStatus('error')
      setErrorMessage(
        error.message === 'User already registered'
          ? 'Un compte existe déjà avec cet email.'
          : error.message === 'email rate limit exceeded'
            ? 'Trop de tentatives. Réessaie dans quelques minutes.'
            : error.message === 'Failed to fetch' || error.message.includes('fetch')
              ? 'Impossible de joindre le serveur. Vérifie ta connexion internet.'
              : error.message,
      )
      return
    }

    setStatus('verification-required')
  }

  const isSubmitting = status === 'submitting'

  if (status === 'verification-required') {
    return (
      <AuthLayout
        title="Vérifie ta boîte mail"
        subtitle="Nous venons de t'envoyer un lien de confirmation pour sécuriser ton compte."
        tagline="Confirmation du compte"
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
            Clique sur le lien dans l'email reçu pour activer ton compte artisan et accéder
            immédiatement à ton espace de travail.
          </p>

          <div className="mt-6 flex w-full flex-col gap-3">
            <Button asChild variant="primary" className="w-full shadow-accent-glow">
              <Link to="/sign-in">Retour à la connexion</Link>
            </Button>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Créer un compte"
      subtitle="Rejoins Kōv pour piloter tes devis, marges et chantiers avec précision."
      tagline="Inscription gratuite & rapide"
    >
      {!isOnline && (
        <div
          role="status"
          className="mb-5 flex items-center gap-3 rounded-sm border border-urgence-500/30 bg-urgence-500/10 p-3.5 text-[12.5px] font-semibold text-urgence-300"
        >
          <WifiOff size={18} className="shrink-0 text-urgence-500" />
          <span>Hors ligne — l'inscription nécessite une connexion internet active.</span>
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

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

        <Input
          type={showPassword ? 'text' : 'password'}
          label="Mot de passe"
          autoComplete="new-password"
          placeholder="••••••••••••"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isSubmitting || !isOnline}
          leftIcon={<Lock size={17} />}
          rightAdornment={
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Masquer' : 'Afficher'}
              className="flex h-8 w-8 items-center justify-center rounded-xs text-text-low transition-colors hover:text-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
        />

        <Input
          type={showConfirmPassword ? 'text' : 'password'}
          label="Confirmer le mot de passe"
          autoComplete="new-password"
          placeholder="••••••••••••"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={isSubmitting || !isOnline}
          leftIcon={<Lock size={17} />}
          rightAdornment={
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              aria-label={showConfirmPassword ? 'Masquer' : 'Afficher'}
              className="flex h-8 w-8 items-center justify-center rounded-xs text-text-low transition-colors hover:text-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
        />

        {/* Live validation feedback chips */}
        {password.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11.5px]">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 font-bold transition-colors',
                isLengthValid
                  ? 'bg-success-bg/15 text-success-text'
                  : 'bg-recessed text-text-low',
              )}
            >
              {isLengthValid ? (
                <CheckCircle2 size={12} className="text-success" />
              ) : (
                <XCircle size={12} />
              )}
              8 caractères min.
            </span>
            {confirmPassword.length > 0 && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 font-bold transition-colors',
                  isMatchValid
                    ? 'bg-success-bg/15 text-success-text'
                    : 'bg-error-bg/15 text-error-text',
                )}
              >
                {isMatchValid ? (
                  <CheckCircle2 size={12} className="text-success" />
                ) : (
                  <XCircle size={12} className="text-error" />
                )}
                Mots de passe identiques
              </span>
            )}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting || !isOnline}
          className="mt-2 w-full shadow-accent-glow active:scale-[0.98] transition-transform"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={18} className="animate-spin text-white" />
              Création du compte...
            </span>
          ) : (
            "S'inscrire"
          )}
        </Button>
      </form>

      <div className="mt-7 flex flex-col items-center border-t border-divider/20 pt-5 text-[13px]">
        <p className="text-text-mid">
          Déjà un compte ?{' '}
          <Link
            to="/sign-in"
            className="font-bold text-brand-300 transition-colors hover:text-brand-500 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:rounded-xs"
          >
            Se connecter
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
