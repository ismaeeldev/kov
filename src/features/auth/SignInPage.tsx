import * as React from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail, WifiOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { supabase } from '@/lib/supabase'

/**
 * Sign In — Lavish, ultra-modern authentication screen.
 * States: idle / submitting / error.
 * Post-success redirect is handled entirely by GuestOnlyRoute.
 */
export default function SignInPage() {
  const isOnline = useOnlineStatus()

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [status, setStatus] = React.useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  // A ref, not the `status` state check alone — see SatisfactionPage.tsx's
  // doc comment (module 15 deep audit, 2026-10-08). Closes the same-tick
  // double-submit window on a fast double-click (module 20 close-out sweep,
  // 2026-10-15).
  const submittingRef = React.useRef(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isOnline || submittingRef.current) return
    submittingRef.current = true

    setStatus('submitting')
    setErrorMessage(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      submittingRef.current = false
      setStatus('error')
      setErrorMessage(
        error.message === 'Invalid login credentials'
          ? 'Email ou mot de passe incorrect.'
          : error.message === 'Failed to fetch' || error.message.includes('fetch')
            ? 'Impossible de joindre le serveur. Vérifie ta connexion internet.'
            : error.message,
      )
      return
    }
  }

  const isSubmitting = status === 'submitting'

  return (
    <AuthLayout
      title="Bon retour"
      subtitle="Connecte-toi à ton espace artisan Kōv pour gérer tes devis et chantiers."
      tagline="Portail de connexion artisan"
    >
      {!isOnline && (
        <div
          role="status"
          className="mb-5 flex items-center gap-3 rounded-sm border border-urgence-500/30 bg-urgence-500/10 p-3.5 text-[12.5px] font-semibold text-urgence-300"
        >
          <WifiOff size={18} className="shrink-0 text-urgence-500" />
          <span>Hors ligne — la connexion nécessite une connexion internet active.</span>
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

        <Input
          type={showPassword ? 'text' : 'password'}
          label="Mot de passe"
          autoComplete="current-password"
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

        <div className="flex items-center justify-end pt-0.5">
          <Link
            to="/forgot-password"
            className="text-[12.5px] font-bold text-brand-300 transition-colors hover:text-brand-500 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:rounded-xs"
          >
            Mot de passe oublié ?
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting || !isOnline}
          className="mt-1.5 w-full shadow-accent-glow active:scale-[0.98] transition-transform"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={18} className="animate-spin text-white" />
              Connexion en cours...
            </span>
          ) : (
            'Se connecter'
          )}
        </Button>
      </form>

      <div className="mt-7 flex flex-col items-center border-t border-divider/20 pt-5 text-[13px]">
        <p className="text-text-mid">
          Pas encore de compte ?{' '}
          <Link
            to="/sign-up"
            className="font-bold text-brand-300 transition-colors hover:text-brand-500 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:rounded-xs"
          >
            Créer un compte artisan
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
