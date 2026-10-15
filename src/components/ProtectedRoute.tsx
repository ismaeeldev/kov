import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface ProfileState {
  userId: string
  generation: number
  onboardingComplete: boolean
}

// Bumped whenever onboarding completion changes profiles.onboarding_complete
// server-side, so every mounted ProtectedRoute re-fetches instead of reusing
// a stale "still incomplete" read cached from before completion — see
// notifyOnboardingComplete()'s doc comment below for the full story.
let onboardingGeneration = 0
const onboardingGenerationListeners = new Set<() => void>()

// Module-level cache for the profile fetch result — UX fix (2026-10-06):
// every <Route element={<ShellRoute>...}>} in App.tsx is a structurally
// distinct JSX element per path, so React Router UNMOUNTS the previous
// ProtectedRoute instance and mounts a brand-new one on every single
// navigation between protected pages, even between two tabs the user
// switches between constantly. With `profile`/`fetchedFor` as plain
// component-local useState/useRef, that remount reset them to null every
// time, re-showing this component's own generic (non-page-shaped) loading
// skeleton on every single page switch — not just the first load of a
// session, as intended. Found via direct user report ("every time I switch
// pages a general skeleton shows first, then the page one") plus
// confirmation of the actual remount mechanics in App.tsx's per-route JSX.
// Caching the resolved profile at module scope (same pattern as
// onboardingGeneration right above) means only the FIRST ProtectedRoute
// mount in a session ever shows this skeleton — every subsequent remount
// (i.e. every later navigation) reads the already-known answer synchronously
// on its very first render, so only the destination page's own
// useMinDuration-backed skeleton is ever visible after that.
let cachedProfile: ProfileState | null = null

/**
 * Call this the moment profiles.onboarding_complete is set to true (from
 * OnboardingPage's completion step) — WITHOUT it, a ProtectedRoute instance
 * that already cached profiles.onboarding_complete=false while mounted on
 * /onboarding never re-fetches after navigate('/home'), because the cached
 * profile still matches the same user id. That stale read then bounces the
 * user straight back to /onboarding right after they complete it — a real
 * bug found via live Playwright testing in Step 7 (the URL visibly flickers
 * /home -> /onboarding within ~1 second of "Terminer").
 */
export function notifyOnboardingComplete() {
  onboardingGeneration += 1
  onboardingGenerationListeners.forEach((listener) => listener())
}

/**
 * Protected-route wrapper — docs/03_MasterPrompts.md §4.2 item 4, filled in
 * for real at Step 5.3.
 *
 * - No session -> redirect to /sign-in, preserving the intended route (via
 *   location state) so Sign In can redirect back after success.
 * - Session but profiles.onboarding_complete is false -> redirect to /onboarding
 *   (unless already there, to avoid a redirect loop).
 * - Otherwise -> render children.
 * - While the session/profile check is in flight, show a skeleton — never a
 *   blank screen and never a premature redirect before we actually know the
 *   real state (docs/04_ApplicationFlow.md §4, "Loading" + "Unauthorized" rows).
 *
 * `chrome`: an optional wrapper (e.g. AppShell) applied around BOTH the
 * loading skeleton and the resolved children — without this, a route wrapped
 * as `<ProtectedRoute><AppShell>{page}</AppShell></ProtectedRoute>` loses its
 * persistent nav (BottomTabNav/SideNavRail) during every loading-skeleton
 * render, since that branch returns before AppShell ever mounts. Found via a
 * live screenshot survey (2026-09-26): the nav genuinely disappears — the
 * whole viewport loses wayfinding chrome — on every navigation this skeleton
 * is visible long enough to see, not just a rare edge case.
 */
export function ProtectedRoute({
  children,
  chrome,
}: {
  children: ReactNode
  chrome?: (content: ReactNode) => ReactNode
}) {
  const wrap = chrome ?? ((content: ReactNode) => content)
  const { user, isLoading: authLoading } = useAuth()
  const location = useLocation()
  // Lazy initializer reads the module-level cache synchronously — if a
  // prior ProtectedRoute instance already resolved this user's profile this
  // session, a remount (i.e. every subsequent navigation) starts with the
  // real answer already in hand instead of null, skipping the loading
  // branch entirely rather than re-showing it.
  const [profile, setProfile] = useState<ProfileState | null>(() => cachedProfile)
  const [generation, setGeneration] = useState(onboardingGeneration)

  useEffect(() => {
    const listener = () => setGeneration(onboardingGeneration)
    onboardingGenerationListeners.add(listener)
    return () => {
      onboardingGenerationListeners.delete(listener)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    // Skip re-fetching if the module-level cache already has a result for
    // this exact user+generation — covers both a fresh mount (the lazy
    // useState initializer above already picked it up) and a remount where
    // React re-runs this effect but the answer hasn't changed.
    if (cachedProfile?.userId === user.id && cachedProfile?.generation === generation) return
    let isMounted = true
    supabase
      .from('profiles')
      .select('onboarding_complete')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!isMounted) return
        const resolved: ProfileState = {
          userId: user.id,
          generation,
          onboardingComplete: data?.onboarding_complete ?? false,
        }
        cachedProfile = resolved
        setProfile(resolved)
      })
    return () => {
      isMounted = false
    }
  }, [user, generation])

  // The profile fetch is "in flight" whenever we have a user but haven't yet
  // recorded a profile result for THIS SPECIFIC USER AND GENERATION — guards
  // against showing stale data momentarily after a sign-out-then-sign-in-as-
  // different-user, AND against showing a stale pre-completion read right
  // after notifyOnboardingComplete() bumps the generation.
  const profileLoading =
    !!user && (profile?.userId !== user.id || profile?.generation !== generation)

  if (authLoading || profileLoading) {
    return wrap(
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-8 w-40 rounded-xs" />
          <Skeleton className="h-9 w-28 rounded-sm" />
        </div>
        <Skeleton className="mb-6 h-11 w-full rounded-sm" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full rounded-sm" count={3} />
        </div>
      </div>,
    )
  }

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />
  }

  if (profile?.onboardingComplete === false && !location.pathname.startsWith('/onboarding')) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
