import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'

/**
 * Route/screen crossfade — docs/02_ThemeGuideline.md §9.2: "Crossfade + 8px
 * slide, 180ms, via Framer's AnimatePresence — fast, never a hard cut."
 * Wraps `<Routes>` in App.tsx, keyed by pathname so each route change plays
 * a fresh fade-in.
 *
 * Deliberately a fade-IN only (no `AnimatePresence`/exit animation/`mode=
 * "wait"`, no explicit `location` prop passed to `<Routes>`): an exit-then-
 * enter sequence requires briefly rendering the outgoing route against a
 * pinned stale `location` while the real URL has already moved on, and nested
 * data-fetching effects (ProtectedRoute's profile check, a page's own on-
 * mount load()) don't always tolerate that gap cleanly. A mount-only fade
 * gets the same "never a hard cut" result — `key={pathname}` still makes
 * React treat each route as a fresh element, replaying the fade on every
 * navigation — without introducing that class of risk for a purely
 * cosmetic transition. (An early version of this component did use the
 * fuller AnimatePresence pattern; a live repro that looked like it broke
 * Home's data load turned out, on investigation, to be an unrelated dev-only
 * StrictMode double-fetch artifact — but the simpler fade-only version below
 * is still the safer default going forward, so it was kept.)
 *
 * Reduced-motion: no manual guard needed — pure Framer Motion (`motion.div`),
 * covered by main.tsx's app-root `MotionConfig reducedMotion="user"`.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const location = useLocation()

  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  )
}
