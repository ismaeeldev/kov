import { AnimatePresence, motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useSlowNetwork } from '@/hooks/useSlowNetwork'

/**
 * Slim, non-blocking "toujours en cours..." banner — docs/04_ApplicationFlow.md
 * §4's "Slow network" row: a fetch taking longer than ~2-3s shows this rather
 * than looking frozen. Mounted ONCE at the app root, same posture as
 * OfflineBanner. Suppressed while genuinely offline (OfflineBanner already
 * owns that message — showing both at once would be redundant/confusing).
 */
function SlowNetworkBanner() {
  const isSlow = useSlowNetwork()
  const isOnline = useOnlineStatus()

  return (
    <AnimatePresence>
      {isSlow && isOnline ? (
        <motion.div
          data-slot="slow-network-banner"
          role="status"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-recessed px-4 py-2 text-[12px] font-bold text-text-hi"
        >
          <Loader2 size={14} strokeWidth={2} className="animate-spin" />
          Toujours en cours...
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export { SlowNetworkBanner }
