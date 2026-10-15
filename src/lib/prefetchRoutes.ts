/**
 * Idle-time prefetch for the 5 primary nav-tab route chunks — UX fix
 * (2026-10-04): after code-splitting every route (perf audit, 2026-10-03),
 * switching tabs could show the generic `RouteChunkFallback` skeleton for a
 * few seconds on a cold navigation, since each tab's JS chunk was only ever
 * fetched the first time that tab was actually clicked. These 5 destinations
 * (Home, Planning, Devis, Clients, Profil) are the ones a user switches
 * between constantly via BottomTabNav/SideNavRail, so prefetching them once,
 * shortly after the authenticated shell mounts, means the chunk is already
 * in the browser's module cache by the time a real click happens — Suspense
 * then resolves instantly instead of showing the fallback.
 *
 * Deliberately NOT prefetching every route (quote editor, accounting export,
 * etc.) — those are either one-off destinations or carry heavy dependencies
 * (pdf-lib) that shouldn't be downloaded speculatively on every session.
 */
const NAV_CHUNK_LOADERS = {
  home: () => import('@/features/home/HomePage'),
  planning: () => import('@/features/planning/PlanningPage'),
  devis: () => import('@/features/quotes/QuotesListPage'),
  clients: () => import('@/features/clients/ClientsListPage'),
  profil: () => import('@/features/settings/ProfilePage'),
} as const

function prefetchNavChunks() {
  for (const load of Object.values(NAV_CHUNK_LOADERS)) void load()
}

/** Prefetch a single nav tab's chunk immediately — called on hover/touch-
 * start of a BottomTabNav/SideNavRail item, so a genuinely fast click (faster
 * than the idle-callback window above) still has a head start on the chunk
 * download rather than waiting for the click itself to trigger it. */
export function prefetchNavChunk(id: keyof typeof NAV_CHUNK_LOADERS) {
  void NAV_CHUNK_LOADERS[id]()
}

let scheduled = false

/** Call once, from the authenticated app shell — safe to call multiple
 * times (e.g. on every AppShell mount across remounts), only ever schedules
 * the idle prefetch once per page load. */
export function schedulePrefetchNavChunks() {
  if (scheduled) return
  scheduled = true
  // requestIdleCallback isn't available in every browser (notably Safari) —
  // fall back to a short timeout so this never competes with the current
  // route's own real data fetch for bandwidth/main-thread time.
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => prefetchNavChunks(), { timeout: 2000 })
  } else {
    setTimeout(prefetchNavChunks, 1200)
  }
}
