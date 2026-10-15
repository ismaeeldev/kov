import { useEffect, useState } from 'react'
import { subscribeSlowNetwork } from '@/lib/apiClient'

/**
 * True whenever at least one apiRead/apiWrite call has been in flight for
 * longer than apiClient.ts's SLOW_THRESHOLD_MS (2.5s) — docs/04_ApplicationFlow.md
 * §4's "Slow network" row. Consumed by SlowNetworkBanner (mounted once at the
 * app root, same posture as OfflineBanner) so no per-screen wiring is needed.
 */
export function useSlowNetwork(): boolean {
  const [isSlow, setIsSlow] = useState(false)

  useEffect(() => subscribeSlowNetwork(setIsSlow), [])

  return isSlow
}
