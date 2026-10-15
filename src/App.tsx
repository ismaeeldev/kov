import type { ReactNode } from 'react'
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { GuestOnlyRoute } from '@/components/GuestOnlyRoute'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RouteTransition } from '@/components/RouteTransition'
import { OfflineBanner } from '@/components/ui/OfflineBanner'
import { SlowNetworkBanner } from '@/components/ui/SlowNetworkBanner'
import { TopLoader } from '@/components/ui/TopLoader'
import ComponentPreview from '@/dev/ComponentPreview'

// Route-level code-splitting (perf audit, 2026-10-03): every one of these 26
// page components was previously a static top-level import, so the ENTIRE
// app — the quote editor, PDF generation (pdf-lib), the Kōv Agent chat, GSAP/
// Framer Motion, accounting export — bundled into one 1,459 KB (470 KB gzip)
// JS file that had to download/parse/compile in full before even the sign-in
// form could render. React.lazy() + Suspense below splits each route into
// its own chunk, fetched only when that route is actually visited.
// ProtectedRoute/AppShell/GuestOnlyRoute/RouteTransition stay static imports
// since they're needed on every route regardless of destination.
const AgentPage = lazy(() => import('@/features/agent/AgentPage'))
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'))
const SignInPage = lazy(() => import('@/features/auth/SignInPage'))
const SignUpPage = lazy(() => import('@/features/auth/SignUpPage'))
const ClientDetailPage = lazy(() => import('@/features/clients/ClientDetailPage'))
const ClientsListPage = lazy(() => import('@/features/clients/ClientsListPage'))
const HomePage = lazy(() => import('@/features/home/HomePage'))
const InvoicingPage = lazy(() => import('@/features/invoicing/InvoicingPage'))
const MessagesPage = lazy(() => import('@/features/messages/MessagesPage'))
const OnboardingPage = lazy(() => import('@/features/onboarding/OnboardingPage'))
const OrdersPage = lazy(() => import('@/features/orders/OrdersPage'))
const PlanningPage = lazy(() => import('@/features/planning/PlanningPage'))
const ChangeOrderReviewPage = lazy(() => import('@/features/projects/ChangeOrderReviewPage'))
const ProjectDetailPage = lazy(() => import('@/features/projects/ProjectDetailPage'))
const QuoteEditorPage = lazy(() => import('@/features/quotes/QuoteEditorPage'))
const QuotesListPage = lazy(() => import('@/features/quotes/QuotesListPage'))
const AccountingExportPage = lazy(() => import('@/features/accounting/AccountingExportPage'))
const BusinessSettingsPage = lazy(() => import('@/features/settings/BusinessSettingsPage'))
const ProfilePage = lazy(() => import('@/features/settings/ProfilePage'))
const FinancingPage = lazy(() => import('@/features/financing/FinancingPage'))
const MigrationPage = lazy(() => import('@/features/migration/MigrationPage'))
const PriceLibraryPage = lazy(() => import('@/features/price-library/PriceLibraryPage'))
const SatisfactionPage = lazy(() => import('@/features/satisfaction/SatisfactionPage'))
const TeamPage = lazy(() => import('@/features/team/TeamPage'))
const TechnicalSheetsPage = lazy(() => import('@/features/technical-sheets/TechnicalSheetsPage'))
const UnpaidPage = lazy(() => import('@/features/unpaid/UnpaidPage'))

/**
 * Suspense fallback for a lazy route chunk still downloading. UX fix
 * (2026-10-04): this previously rendered a full generic 2-block skeleton
 * shape — on anything slower than a near-instant chunk fetch, that reads as
 * a jarring, unrelated loading UI flashing between the outgoing page and the
 * destination page's own properly-SHAPED skeleton (e.g. Clients' list-row
 * skeleton, Home's stat-tile skeleton). Since TopLoader (mounted once at the
 * app root) already fires on every route change and is the app's
 * established "something is happening" signal, this fallback is now a bare,
 * minimal block — present only long enough to avoid a blank flash, never
 * competing with TopLoader's bar or pretending to be a shaped preview of
 * content it has no way of knowing the shape of. Combined with
 * prefetchRoutes.ts's idle-time + on-hover prefetching of the 5 primary nav
 * tabs, this fallback should rarely be visible at all in normal tab-to-tab
 * navigation — only on a genuinely cold, unprefetched route.
 */
function RouteChunkFallback() {
  return <div className="min-h-screen bg-page-bg" />
}

/**
 * A protected screen wrapped in the persistent nav shell (BottomTabNav on
 * mobile/tablet, SideNavRail on desktop). Used for every one of the 5 tab
 * destinations plus their nested/secondary screens — NOT used for onboarding
 * (its own dedicated flow, no persistent nav) or the quote editor's 4-step
 * wizard (its own back/continue navigation takes over, see AppShell.tsx's
 * doc comment for the full reasoning).
 */
function ShellRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute chrome={(content) => <AppShell>{content}</AppShell>}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  )
}

/**
 * Router shell — docs/03_MasterPrompts.md §4.2. Every screen from
 * docs/04_ApplicationFlow.md §1/§2 gets a route here, wired to a placeholder
 * component for now (real content replaces placeholders starting with Auth in
 * Step 5, then every other screen from Step 6 onward).
 *
 * s-marge and s-sign are NOT routed here — they are embedded support screens
 * (rendered inside the quote editor / chantier screens), per
 * docs/04_ApplicationFlow.md §2.22/§2.23. Modals (mo-*) are dialog state, not
 * routes, and are built alongside the screen they open from.
 *
 * OfflineBanner is mounted once here at the true root layout (moved from
 * Step 3's temporary main.tsx mount, per docs/07_ProjectState.md's Step 4 note).
 */
function App() {
  return (
    <>
      <TopLoader />
      <OfflineBanner />
      <SlowNetworkBanner />
      <RouteTransition>
        <Suspense fallback={<RouteChunkFallback />}>
        <Routes>
          {/* Unauthenticated — guest-only: an already-signed-in user is bounced
        to /home rather than shown these forms again (found missing via a
        live redirect-logic audit). */}
          <Route
            path="/sign-in"
            element={
              <GuestOnlyRoute>
                <SignInPage />
              </GuestOnlyRoute>
            }
          />
          <Route
            path="/sign-up"
            element={
              <GuestOnlyRoute>
                <SignUpPage />
              </GuestOnlyRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <GuestOnlyRoute>
                <ForgotPasswordPage />
              </GuestOnlyRoute>
            }
          />

          {/* Onboarding — authenticated, but onboarding-incomplete state. No
        persistent nav shell during onboarding, same as the quote editor's
        wizard below (see ShellRoute's doc comment). */}
          <Route
            path="/onboarding/:step?"
            element={
              <ProtectedRoute>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />

          {/* Authenticated, onboarding-complete — 5 tabs + FAB destinations */}
          <Route
            path="/home"
            element={
              <ShellRoute>
                <HomePage />
              </ShellRoute>
            }
          />
          <Route
            path="/planning"
            element={
              <ShellRoute>
                <PlanningPage />
              </ShellRoute>
            }
          />
          <Route
            path="/quotes"
            element={
              <ShellRoute>
                <QuotesListPage />
              </ShellRoute>
            }
          />
          {/* Quote editor's own 4-step wizard — no persistent nav shell, see
        ShellRoute's doc comment. */}
          <Route
            path="/quotes/new"
            element={
              <ProtectedRoute>
                <QuoteEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/quotes/:id/edit"
            element={
              <ProtectedRoute>
                <QuoteEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients"
            element={
              <ShellRoute>
                <ClientsListPage />
              </ShellRoute>
            }
          />
          <Route
            path="/clients/:id"
            element={
              <ShellRoute>
                <ClientDetailPage />
              </ShellRoute>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <ShellRoute>
                <ProjectDetailPage />
              </ShellRoute>
            }
          />
          {/* Avenant review/send — its own focused flow, same reasoning as the
        quote editor wizard: no persistent nav shell during it. */}
          <Route
            path="/projects/change-order/:changeOrderId"
            element={
              <ProtectedRoute>
                <ChangeOrderReviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/agent"
            element={
              <ProtectedRoute>
                <AgentPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/unpaid"
            element={
              <ShellRoute>
                <UnpaidPage />
              </ShellRoute>
            }
          />
          <Route
            path="/invoices"
            element={
              <ShellRoute>
                <InvoicingPage />
              </ShellRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ShellRoute>
                <OrdersPage />
              </ShellRoute>
            }
          />
          <Route
            path="/messages"
            element={
              <ShellRoute>
                <MessagesPage />
              </ShellRoute>
            }
          />

          {/* Profile + nested secondary-function screens */}
          <Route
            path="/profile"
            element={
              <ShellRoute>
                <ProfilePage />
              </ShellRoute>
            }
          />
          <Route
            path="/profile/business"
            element={
              <ShellRoute>
                <BusinessSettingsPage />
              </ShellRoute>
            }
          />
          <Route
            path="/profile/price-library"
            element={
              <ShellRoute>
                <PriceLibraryPage />
              </ShellRoute>
            }
          />
          <Route
            path="/profile/technical-sheets"
            element={
              <ShellRoute>
                <TechnicalSheetsPage />
              </ShellRoute>
            }
          />
          <Route
            path="/profile/team"
            element={
              <ShellRoute>
                <TeamPage />
              </ShellRoute>
            }
          />
          <Route
            path="/profile/accounting-export"
            element={
              <ShellRoute>
                <AccountingExportPage />
              </ShellRoute>
            }
          />
          <Route
            path="/profile/migration"
            element={
              <ShellRoute>
                <MigrationPage />
              </ShellRoute>
            }
          />
          <Route
            path="/profile/financing"
            element={
              <ShellRoute>
                <FinancingPage />
              </ShellRoute>
            }
          />
          <Route
            path="/profile/satisfaction"
            element={
              <ShellRoute>
                <SatisfactionPage />
              </ShellRoute>
            }
          />

          {/* Dev-only component preview (Step 2.2) — never linked from real nav */}
          <Route path="/__dev/components" element={<ComponentPreview />} />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
        </Suspense>
      </RouteTransition>
    </>
  )
}

export default App
