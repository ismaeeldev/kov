import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

/**
 * Slim, non-blocking app-wide banner — docs/03_MasterPrompts.md §3.2. Mounted
 * ONCE at the app root (Step 4's router shell), never per-screen. Must never
 * false-trigger on a merely slow connection — only genuine offline state
 * (useOnlineStatus, which listens to real 'online'/'offline' events, not
 * request latency).
 */
function OfflineBanner() {
  const isOnline = useOnlineStatus()

  return (
    <AnimatePresence>
      {!isOnline ? (
        <motion.div
          data-slot="offline-banner"
          role="status"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-urgence-700 px-4 py-2 text-[12px] font-bold text-white"
        >
          <WifiOff size={14} strokeWidth={2} />
          Hors ligne — reconnexion en cours...
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export { OfflineBanner }
