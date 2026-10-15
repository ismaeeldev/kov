import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { apiRead, ApiTimeoutError } from '@/lib/apiClient'

export interface ProfileRow {
  id: string
  onboarding_step: number
  onboarding_complete: boolean
  trade: 'plomberie_chauffage'
  team_mode: 'solo' | 'equipe'
}

export interface BusinessRow {
  id: string
  owner_id: string
  legal_name: string
  siren: string | null
  address: { street?: string; postal_code?: string; city?: string } | null
  phone: string | null
  email: string | null
  default_vat_rate: number
  legal_mentions: Record<string, string>
  legal_fields_complete: boolean
  default_supplier_name: string | null
  accountant_email: string | null
}

interface LoadedResult {
  reloadToken: number
  profile: ProfileRow | null
  business: BusinessRow | null
  error: string | null
}

/**
 * Loads the current owner's profiles + businesses rows — shared by the
 * onboarding flow (Step 6) and /profile/business (post-onboarding edits),
 * so both read/write through the exact same fetch logic. businesses may be
 * null until the business-info onboarding step first creates it.
 *
 * Loading state is DERIVED (no synchronous setState inside the effect body)
 * to satisfy eslint-plugin-react-hooks's set-state-in-effect rule — same
 * pattern as src/components/ProtectedRoute.tsx.
 */
export function useOwnerRecord() {
  const { user } = useAuth()
  const [result, setResult] = useState<LoadedResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const fetchedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!user) return
    const key = `${user.id}:${reloadToken}`
    if (fetchedFor.current === key) return
    fetchedFor.current = key
    let isMounted = true

    async function load() {
      try {
        const [{ data: profile, error: profileError }, { data: business, error: businessError }] =
          await Promise.all([
            apiRead((client) => client.from('profiles').select('*').eq('id', user!.id).single()),
            apiRead((client) =>
              client.from('businesses').select('*').eq('owner_id', user!.id).maybeSingle(),
            ),
          ])

        if (!isMounted) return

        if (profileError) {
          setResult({ reloadToken, profile: null, business: null, error: profileError.message })
          return
        }

        setResult({
          reloadToken,
          profile: profile as ProfileRow,
          business: (business as BusinessRow) ?? null,
          error: businessError ? businessError.message : null,
        })
      } catch (err) {
        if (!isMounted) return
        setResult({
          reloadToken,
          profile: null,
          business: null,
          error: err instanceof ApiTimeoutError ? err.message : 'Une erreur est survenue.',
        })
      }
    }

    load()

    return () => {
      isMounted = false
      // React 19 StrictMode double-invokes this effect on mount (mount ->
      // cleanup -> mount again) before this fetch resolves. Without resetting
      // the ref here, the second mount's `fetchedFor.current === key` check
      // above sees the FIRST mount's already-set key and skips calling load()
      // entirely — the first mount's own result then gets silently dropped
      // by the `isMounted` guard once it does resolve, leaving `result` stuck
      // null forever (isLoading permanently true) — found live via Playwright:
      // /onboarding hung indefinitely on the loading skeleton, reproducible
      // every time. Resetting on cleanup lets the second, real mount run its
      // own fetch to completion.
      fetchedFor.current = null
    }
  }, [user, reloadToken])

  const refetch = () => setReloadToken((t) => t + 1)

  // "Loading" whenever we haven't yet recorded a result for the CURRENT
  // user + reloadToken combination — guards against showing stale data
  // after a sign-out-then-sign-in-as-different-user, and correctly re-enters
  // a loading state on refetch() rather than showing stale data mid-refresh.
  const isLoading = !user || result?.reloadToken !== reloadToken

  return {
    isLoading,
    profile: result?.profile ?? null,
    business: result?.business ?? null,
    error: result?.error ?? null,
    refetch,
  }
}
