import * as React from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, Wifi, Zap } from 'lucide-react'
import { BrandWordmark } from '@/components/ui/BrandWordmark'
import { cn } from '@/lib/utils'

export interface AuthLayoutProps {
  children: React.ReactNode
  title?: React.ReactNode
  subtitle?: React.ReactNode
  tagline?: string
  className?: string
  cardClassName?: string
  showTrustBadges?: boolean
}

/**
 * Lavish Auth Screen Layout wrapper.
 * Provides ambient steel-blue glow, glassmorphic card with top accent highlight,
 * brand wordmark header, and reassuring trust points.
 */
export function AuthLayout({
  children,
  title,
  subtitle,
  tagline = 'Gestion de chantiers & devis',
  className,
  cardClassName,
  showTrustBadges = true,
}: AuthLayoutProps) {
  return (
    <div
      className={cn(
        'relative min-h-screen w-full flex flex-col items-center justify-center overflow-x-hidden bg-page-bg px-4 py-8 sm:px-6 sm:py-12',
        className,
      )}
    >
      {/* Ambient background radiant lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden flex items-center justify-center"
      >
        {/* Top-center radiant steel-blue glow */}
        <div className="absolute -top-32 h-[480px] w-[640px] rounded-full bg-brand-500/10 blur-[120px] dark:bg-brand-500/15" />
        {/* Subtle bottom-right gold accent glow */}
        <div className="absolute -bottom-24 -right-24 h-[380px] w-[380px] rounded-full bg-gold-500/5 blur-[100px]" />
        {/* Fine background grid overlay for high-tech premium feel */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--divider)_1px,transparent_1px),linear-gradient(to_bottom,var(--divider)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_35%,#000_70%,transparent_100%)] opacity-[0.25] dark:opacity-[0.18]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[450px]"
      >
        {/* Brand Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandWordmark size="lg" proBadge withTagline tagline={tagline} />
        </div>

        {/* Glassmorphic Raised Card */}
        <div
          className={cn(
            'relative overflow-hidden rounded-md border border-divider/40 bg-surface/95 p-6 shadow-floating backdrop-blur-xl sm:p-8',
            'transition-all duration-200',
            cardClassName,
          )}
        >
          {/* Top highlight bar */}
          <div
            aria-hidden="true"
            className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-brand-500 to-transparent opacity-85"
          />

          {title || subtitle ? (
            <div className="mb-6">
              {title ? (
                <h1 className="font-serif text-[26px] font-black tracking-tight text-text-hi">
                  {title}
                </h1>
              ) : null}
              {subtitle ? (
                <p className="mt-1.5 text-[13.5px] font-medium leading-[1.5] text-text-mid">
                  {subtitle}
                </p>
              ) : null}
            </div>
          ) : null}

          {children}
        </div>

        {/* Reassuring artisan trust badges */}
        {showTrustBadges ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="mt-6 flex items-center justify-center gap-4 text-[11px] font-bold text-text-low uppercase tracking-[0.04em]"
          >
            <div className="inline-flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-brand-300" />
              <span>Chiffré SSL/RLS</span>
            </div>
            <span className="text-divider">•</span>
            <div className="inline-flex items-center gap-1.5">
              <Wifi size={14} className="text-brand-300" />
              <span>Mode Hors-Ligne</span>
            </div>
            <span className="text-divider">•</span>
            <div className="inline-flex items-center gap-1.5">
              <Zap size={14} className="text-gold-500" />
              <span>Conforme BTP</span>
            </div>
          </motion.div>
        ) : null}
      </motion.div>
    </div>
  )
}
