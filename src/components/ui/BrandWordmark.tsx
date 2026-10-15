import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BrandWordmarkProps extends React.ComponentProps<'div'> {
  size?: 'sm' | 'md' | 'lg'
  withTagline?: boolean
  tagline?: string
  proBadge?: boolean
}

/**
 * Kōv Brand Wordmark — docs/02_ThemeGuideline.md §3.1 & §8.
 * 'DM Sans', weight 900, tracking -0.04em, with the brand steel-blue macron
 * bar centered over the 'o'.
 */
export function BrandWordmark({
  className,
  size = 'md',
  withTagline = false,
  tagline = 'Gestion de chantiers & devis',
  proBadge = false,
  ...props
}: BrandWordmarkProps) {
  const fontSize = size === 'sm' ? 'text-[22px]' : size === 'lg' ? 'text-[36px]' : 'text-[30px]'
  const barHeight = size === 'sm' ? 'h-[2px]' : 'h-[3px]'
  const barTop = size === 'sm' ? '-top-[2px]' : size === 'lg' ? '-top-[4px]' : '-top-[3px]'
  const barWidth = size === 'sm' ? 'w-[11px]' : size === 'lg' ? 'w-[18px]' : 'w-[15px]'

  return (
    <div className={cn('flex flex-col items-center select-none', className)} {...props}>
      <div className="inline-flex items-center gap-1.5 leading-none">
        <span className={cn('font-sans font-black tracking-[-0.04em] text-text-hi lowercase', fontSize)}>
          k
          <span className="relative inline-block">
            o
            <span
              className={cn(
                'absolute left-1/2 -translate-x-1/2 rounded-full bg-brand-500',
                barHeight,
                barTop,
                barWidth,
              )}
            />
          </span>
          v
        </span>
        {proBadge ? (
          <span className="rounded-pill bg-brand-500/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-brand-300">
            PRO
          </span>
        ) : null}
      </div>
      {withTagline && tagline ? (
        <span className="mt-1.5 text-[11px] font-bold tracking-[0.06em] text-text-low uppercase">
          {tagline}
        </span>
      ) : null}
    </div>
  )
}
