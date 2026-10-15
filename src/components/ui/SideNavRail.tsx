import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { BrandWordmark } from '@/components/ui/BrandWordmark'
import { NAV_ITEMS, type NavItemId } from '@/components/ui/BottomTabNav'
import { prefetchNavChunk } from '@/lib/prefetchRoutes'
import { cn } from '@/lib/utils'

export interface SideNavRailProps {
  activeId: NavItemId
  onSelect: (id: NavItemId) => void
  onFabClick: () => void
  planningHasConflict?: boolean
}

/**
 * Desktop side-rail (1024px+, §6.5). Same five destinations as BottomTabNav
 * plus the brand wordmark and quick-create action pinned near the top;
 * expands labels at all times (not hover-only — desktop sessions are data-dense).
 */
function SideNavRail({ activeId, onSelect, onFabClick, planningHasConflict }: SideNavRailProps) {
  return (
    <nav
      data-slot="side-nav-rail"
      className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col justify-between border-r border-divider/40 bg-surface/95 backdrop-blur-xl p-4 shadow-floating lg:flex"
    >
      <div className="flex flex-col">
        {/* Brand wordmark — docs/02_ThemeGuideline.md §3.1 & §8 */}
        <div className="mb-6 flex items-center justify-between px-2 pt-1.5">
          <BrandWordmark size="sm" proBadge className="items-start" />
        </div>

        <Button
          variant="primary"
          size="sm"
          className="mb-5 w-full justify-start shadow-accent-glow active:scale-[0.98] transition-transform"
          onClick={onFabClick}
        >
          <Plus size={18} strokeWidth={2.5} />
          <span>Nouveau devis</span>
        </Button>

        <div className="flex flex-col gap-1.5">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === activeId
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                onMouseEnter={() => prefetchNavChunk(item.id)}
                className={cn(
                  'group relative flex items-center gap-3.5 rounded-sm px-3.5 py-2.5 text-left text-[13.5px] transition-colors duration-150',
                  isActive ? 'text-brand-300 font-extrabold' : 'text-text-mid font-semibold hover:bg-recessed/80 hover:text-text-hi',
                  'outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                )}
              >
                {/* Shared-layout active-tab indicator — UI-polish pass
                (2026-10-03): replaces the previous static `before:` pseudo-
                element left-bar + flat bg tint (which just snapped between
                items) with the same layoutId-based Framer approach already
                used by BottomTabNav's own active-tab pill and the quote FAB,
                so selecting a different nav item slides this highlight
                smoothly rather than cutting between positions. */}
                {isActive ? (
                  <motion.div
                    layoutId="active-tab-pill"
                    className="absolute inset-0 rounded-sm bg-brand-500/20 shadow-sm before:absolute before:inset-y-1.5 before:left-0 before:w-[3.5px] before:rounded-full before:bg-brand-500"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                ) : null}
                <span
                  className={cn(
                    'relative shrink-0 transition-transform duration-150 group-hover:scale-105',
                    isActive ? 'text-brand-300' : 'text-text-low group-hover:text-text-hi',
                  )}
                >
                  {item.icon}
                </span>
                <span className="relative flex-1 tracking-tight">{item.label}</span>
                {item.id === 'planning' && planningHasConflict ? (
                  <span
                    className="relative h-2.5 w-2.5 rounded-full bg-urgence-500 shadow-urgence-glow ring-2 ring-surface"
                    aria-label="Conflit de planning"
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {/* Subtle bottom footer pill */}
      <div className="mt-auto border-t border-divider/20 pt-3 px-2">
        <div className="flex items-center justify-between text-[11px] font-bold text-text-low">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success-text shadow-sm" />
            <span>En ligne</span>
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-low/80">
            Kōv Pro
          </span>
        </div>
      </div>
    </nav>
  )
}

export { SideNavRail }
