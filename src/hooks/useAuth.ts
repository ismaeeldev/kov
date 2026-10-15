import type { Session, User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface AuthState {
  user: User | null
  session: Session | null
  /** True while the initial session check is in flight — use this to gate
   * ProtectedRoute's redirect logic so it never fires before we actually know
   * whether a session exists. */
  isLoading: boolean
}

const UNRESOLVED_STATE: AuthState = { user: null, session: null, isLoading: true }

// Module-level cache + single shared Supabase auth subscription — UX fix
// (2026-10-06), same root cause and same fix pattern as ProtectedRoute.tsx's
// cachedProfile: every <Route element={<ShellRoute>...}>} in App.tsx is a
// structurally distinct JSX element per path, so React Router fully
// unmounts/remounts ProtectedRoute (and therefore every hook it calls,
// including this one) on EVERY navigation between protected pages, not just
// the first page load. With `state` as plain component-local useState, each
// remount reset `isLoading` back to `true` — and since ProtectedRoute's
// loading gate is `authLoading || profileLoading`, caching only the profile
// half (the original fix) was insufficient: `authLoading` alone kept
// re-triggering the generic skeleton on every single page switch, confirmed
// via live network-throttled testing. Caching the resolved auth state here
// too, backed by exactly ONE real `onAuthStateChange` subscription shared
// across every `useAuth()` call site (not one subscription per mounted
// component), means every hook instance after the very first in a session
// starts with the real, current answer already in hand.
let cachedAuthState: AuthState = UNRESOLVED_STATE
const authStateListeners = new Set<(state: AuthState) => void>()
let sharedSubscriptionStarted = false

function startSharedSubscription() {
  if (sharedSubscriptionStarted) return
  sharedSubscriptionStarted = true

  function publish(next: AuthState) {
    cachedAuthState = next
    authStateListeners.forEach((listener) => listener(next))
  }

  supabase.auth.getSession().then(({ data: { session } }) => {
    publish({ user: session?.user ?? null, session, isLoading: false })
  })

  supabase.auth.onAuthStateChange((_event, session) => {
    publish({ user: session?.user ?? null, session, isLoading: false })
  })
  // Deliberately never unsubscribed — this is a single, app-lifetime
  // subscription (started once, on the first ever useAuth() call), not tied
  // to any individual component's mount/unmount cycle. Unsubscribing on the
  // first component to unmount would silently kill auth-state updates for
  // every OTHER still-mounted consumer.
}

/**
 * App-wide current user/session state — docs/03_MasterPrompts.md §5.3 item 6.
 * Consumed by ProtectedRoute (Step 4) for the real session check, and by any
 * screen needing to know the current owner's id.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(() => cachedAuthState)

  useEffect(() => {
    startSharedSubscription()
    // No extra sync-on-mount call needed here: the lazy useState initializer
    // above already reads `cachedAuthState` at construction time (which is
    // itself after this effect's render was triggered), and registering this
    // listener synchronously, right here, means any resolution the shared
    // subscription publishes AFTER this point is still delivered correctly.
    // The only gap that would matter is the subscription resolving in the
    // narrow window between the lazy-init read and this registration — which
    // cannot happen, since both run synchronously in the same commit with no
    // intervening await.
    authStateListeners.add(setState)
    return () => {
      authStateListeners.delete(setState)
    }
  }, [])

  return state
}
