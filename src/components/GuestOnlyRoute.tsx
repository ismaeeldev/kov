import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'

/**
 * Guest-only route wrapper — the inverse of ProtectedRoute. Wraps /sign-in,
 * /sign-up, /forgot-password: an already-authenticated user landing on any
 * of these must never see the auth form again, they should bounce straight
 * to their intended destination (or /home) — ProtectedRoute itself then
 * decides from there whether that's really /home or a further redirect to
 * /onboarding.
 *
 * Found missing via a live redirect-logic audit — visiting /sign-in or
 * /sign-up while already signed in silently rendered the full form with no
 * guard at all, a real gap since a signed-in user has no reason to ever see
 * those screens again.
 *
 * This component is ALSO the single place that reads location.state.from —
 * SignInPage/SignUpPage deliberately do NOT call their own post-success
 * navigate() to that destination, because doing so races this component's
 * own auth-triggered redirect (both fire off the same signInWithPassword
 * success, in the same tick, and whichever wins is nondeterministic — found
 * live: the explicit navigate() call was consistently losing, landing on
 * /home instead of the originally-intended deep-linked route). Only one of
 * the two must ever decide the destination — this one does, since it is
 * itself gated on `user` actually being set, unlike the page's own call.
 */
export function GuestOnlyRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page-bg p-4 sm:p-6">
        <div className="w-full max-w-[450px] rounded-md border border-divider/40 bg-surface/80 p-8 shadow-floating backdrop-blur-xl">
          <div className="mb-6 flex flex-col items-center">
            <Skeleton className="h-9 w-28 rounded-xs" />
            <Skeleton className="mt-2 h-3.5 w-40 rounded-xs" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-12 w-full rounded-sm" />
            <Skeleton className="h-12 w-full rounded-sm" />
            <Skeleton className="mt-2 h-12 w-full rounded-sm" />
          </div>
        </div>
      </div>
    )
  }

  if (user) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
    return <Navigate to={from ?? '/home'} replace />
  }

  return <>{children}</>
}
