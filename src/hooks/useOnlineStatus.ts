import { useEffect, useState } from 'react'

/**
 * Wraps navigator.onLine + 'online'/'offline' window events — docs/03_MasterPrompts.md
 * §3.2. Consumed by OfflineBanner (mounted once at the app root, Step 4) and by any
 * screen/action from Step 5 onward that must disable client-facing sends while offline
 * (dunning, invoicing, agent plan execution — see docs/04_ApplicationFlow.md §4).
 *
 * IMPORTANT: this only detects genuine offline state (DevTools "Offline" toggle,
 * airplane mode, etc.) — it must NEVER false-trigger on a merely slow connection
 * (Slow 3G). Slow-network handling is a separate concern (apiClient.ts's timeout).
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
