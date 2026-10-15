import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { BottomTabNav, type NavItemId } from '@/components/ui/BottomTabNav'
import { SideNavRail } from '@/components/ui/SideNavRail'
import { usePlanningConflictBadge } from '@/features/planning/usePlanningConflictBadge'
import { schedulePrefetchNavChunks } from '@/lib/prefetchRoutes'

const NAV_ROUTES: Record<NavItemId, string> = {
  home: '/home',
  planning: '/planning',
  devis: '/quotes',
  clients: '/clients',
  profil: '/profile',
}

/** Maps the current pathname to the nav item it belongs under — several
 * routes (e.g. /quotes/new, /quotes/:id/edit) fall under the same tab as
 * their list screen, so this is prefix-matching, not an exact lookup. */
function activeIdForPath(pathname: string): NavItemId | null {
  if (pathname.startsWith('/home')) return 'home'
  if (pathname.startsWith('/planning')) return 'planning'
  if (pathname.startsWith('/quotes')) return 'devis'
  if (pathname.startsWith('/clients')) return 'clients'
  if (pathname.startsWith('/profile')) return 'profil'
  return null
}

/**
 * Persistent app navigation shell — docs/02_ThemeGuideline.md §6.5,
 * docs/03_MasterPrompts.md §4.2 item 7 (BottomTabNav/SideNavRail were BUILT
 * in Step 2 but never actually mounted into the real authenticated app layout
 * anywhere — a real gap found during a dedicated UI-polish/responsiveness
 * audit, not called out by name in any single step's master prompt). Wraps
 * every authenticated, onboarding-complete screen: BottomTabNav on mobile/
 * tablet (<1024px), SideNavRail on desktop (1024px+), content padded so
 * neither ever overlaps it.
 *
 * Screens NOT wrapped by this shell: auth pages, onboarding (its own
 * dedicated flow, no persistent nav during it), and the quote editor's own
 * 4-step wizard (its own back/continue navigation takes over — showing the
 * global nav alongside a multi-step wizard would be confusing, matching how
 * neither BottomTabNav nor SideNavRail were ever designed with a wizard
 * context in mind).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const activeId = activeIdForPath(location.pathname)
  const planningHasConflict = usePlanningConflictBadge()

  // Idle-time prefetch of the 5 nav-tab chunks — see prefetchRoutes.ts's doc
  // comment. Fires once per page load regardless of how many times AppShell
  // itself mounts/remounts across navigations.
  useEffect(() => {
    schedulePrefetchNavChunks()
  }, [])

  function handleSelect(id: NavItemId) {
    navigate(NAV_ROUTES[id])
  }

  function handleFabClick() {
    navigate('/quotes/new')
  }

  return (
    <>
      <BottomTabNav
        activeId={activeId ?? 'home'}
        onSelect={handleSelect}
        onFabClick={handleFabClick}
        planningHasConflict={planningHasConflict}
      />
      <SideNavRail
        activeId={activeId ?? 'home'}
        onSelect={handleSelect}
        onFabClick={handleFabClick}
        planningHasConflict={planningHasConflict}
      />
      {/* Agent entry point — docs/02_ThemeGuideline.md §6.9: "a dedicated FAB
      or nav element using agent-glow shadow and the same purple gradient
      fill, visually distinct from the brand-steel-blue primary FAB." A
      second small floating button rather than replacing the main FAB (which
      stays reserved for quote creation), positioned clear of both the bottom
      tab bar and the primary FAB on mobile, and clear of the side rail on
      desktop. */}
      <motion.button
        type="button"
        onClick={() => navigate('/agent')}
        whileTap={{ scale: 0.94 }}
        transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
        className="fixed right-4 bottom-24 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-[image:var(--gradient-agent)] text-white shadow-agent-glow outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-agent-700 lg:right-6 lg:bottom-6"
        aria-label="Agent Kōv"
      >
        <Sparkles size={22} strokeWidth={2} />
      </motion.button>
      {/* Bottom padding clears the fixed BottomTabNav on mobile/tablet; left
      padding clears the fixed SideNavRail on desktop (lg:). Screens that
      already center their own content in a max-w container are unaffected
      since this padding only shifts the available box, not the content's own
      max-width. `<main>` (Step 14.7 item 7 fix): every authenticated screen
      shares this one shell, so this is the single correct place for the
      landmark-one-main requirement — a real Lighthouse accessibility finding
      (2-point deduction, present on all 6 audited key screens) rather than
      wrapping each of the ~25 individual page components by hand. */}
      <main className="pb-20 lg:pb-0 lg:pl-56">{children}</main>
    </>
  )
}
