import * as React from 'react'
import { motion } from 'framer-motion'
import { Calendar, CircleUserRound, FileText, House, Plus, Users2 } from 'lucide-react'
import { prefetchNavChunk } from '@/lib/prefetchRoutes'
import { cn } from '@/lib/utils'

/**
 * Kōv navigation — docs/02_ThemeGuideline.md §6.5. Exactly five items per the
 * Cahier's confirmed nav map: Accueil, Planning, Devis, Clients, Profil, plus a center
 * FAB for quick quote creation.
 *
 * Mobile (0-1023px): BottomTabNav. Desktop (1024px+): SideNavRail.
 * Both consume the same `items`/`activeId` contract so a parent layout can
 * render whichever is appropriate for the current breakpoint.
 */

export type NavItemId = 'home' | 'planning' | 'devis' | 'clients' | 'profil'

export interface NavItem {
  id: NavItemId
  label: string
  icon: React.ReactNode
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Accueil', icon: <House size={20} strokeWidth={1.75} /> },
  { id: 'planning', label: 'Planning', icon: <Calendar size={20} strokeWidth={1.75} /> },
  { id: 'devis', label: 'Devis', icon: <FileText size={20} strokeWidth={1.75} /> },
  { id: 'clients', label: 'Clients', icon: <Users2 size={20} strokeWidth={1.75} /> },
  { id: 'profil', label: 'Profil', icon: <CircleUserRound size={20} strokeWidth={1.75} /> },
]

export interface BottomTabNavProps {
  activeId: NavItemId
  onSelect: (id: NavItemId) => void
  onFabClick: () => void
  /** Planning tab shows an alert badge when a conflict exists (module 6.10). */
  planningHasConflict?: boolean
}

/**
 * Mobile bottom tab bar (§6.5). The FAB uses accent-glow/steel-blue by default
 * (quote creation); a screen-specific override to the agent purple gradient
 * happens at the call site (see AgentSurface.tsx's own entry-point usage),
 * never here — this component's default is always the brand FAB.
 */
function BottomTabNav({ activeId, onSelect, onFabClick, planningHasConflict }: BottomTabNavProps) {
  const leftItems = NAV_ITEMS.slice(0, 2)
  const rightItems = NAV_ITEMS.slice(2)

  const renderItem = (item: NavItem) => {
    const isActive = item.id === activeId
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelect(item.id)}
        onMouseEnter={() => prefetchNavChunk(item.id)}
        onTouchStart={() => prefetchNavChunk(item.id)}
        className={cn(
          'group relative flex flex-1 flex-col items-center gap-1 py-1.5 transition-colors duration-150',
          isActive ? 'text-brand-300' : 'text-text-mid hover:text-text-hi',
          'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/45',
        )}
      >
        <div
          className={cn(
            'relative flex items-center justify-center rounded-pill px-3.5 py-1.5',
            isActive ? 'text-brand-300' : 'transition-colors duration-200 group-hover:bg-recessed/60',
          )}
        >
          {/* Shared-layout active-tab indicator — UI-polish pass (2026-10-03):
          previously a plain conditional background class that just snapped
          between tabs with no motion, reading as a generic/safe tab-bar
          pattern per the premium-redesign survey. Reuses the same
          layoutId-based Framer approach already established by the FAB
          below ("quote-fab") so the pill now slides smoothly from the old
          active tab to the new one — the same visual grammar as the FAB's
          own shared-element morph, applied consistently across this nav. */}
          {isActive ? (
            <motion.div
              layoutId="active-tab-pill"
              className="absolute inset-0 rounded-pill bg-brand-500/25 shadow-accent-glow"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          ) : null}
          <span className="relative">{item.icon}</span>
          {item.id === 'planning' && planningHasConflict ? (
            <span
              className="absolute top-0.5 right-1.5 h-2 w-2 rounded-full bg-urgence-500 shadow-urgence-glow ring-2 ring-surface"
              aria-label="Conflit de planning"
            />
          ) : null}
        </div>
        <span
          className={cn(
            'text-[10.5px] leading-[1.4] transition-colors',
            isActive ? 'font-extrabold text-brand-300' : 'font-semibold text-text-mid group-hover:text-text-hi',
          )}
        >
          {item.label}
        </span>
      </button>
    )
  }

  return (
    <nav
      data-slot="bottom-tab-nav"
      className="fixed inset-x-0 bottom-0 z-40 flex items-end justify-between border-t border-divider/40 bg-surface/95 backdrop-blur-xl px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 shadow-floating lg:hidden"
    >
      {leftItems.map(renderItem)}

      <div className="flex flex-1 justify-center">
        <motion.button
          type="button"
          layoutId="quote-fab"
          onClick={onFabClick}
          whileTap={{ scale: 0.94 }}
          transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
          className="-mt-7 flex h-15 w-15 items-center justify-center rounded-full bg-brand-500 text-white shadow-accent-glow hover:bg-brand-700 hover:shadow-accent-glow outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-all"
          aria-label="Nouveau devis"
        >
          <Plus size={26} strokeWidth={2.25} />
        </motion.button>
      </div>

      {rightItems.map(renderItem)}
    </nav>
  )
}

export { BottomTabNav }
