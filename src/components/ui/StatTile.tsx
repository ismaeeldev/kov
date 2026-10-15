import * as React from 'react'
import { cn } from '@/lib/utils'

export interface StatTileProps extends React.ComponentProps<'div'> {
  icon?: React.ReactNode
  value: React.ReactNode
  label: React.ReactNode
  /** Optional trend arrow — green for positive, red for negative (docs/02_ThemeGuideline.md §6.2) */
  trend?: 'up' | 'down'
}

/**
 * Stat tile — docs/02_ThemeGuideline.md §6.2: recessed surface, centered
 * icon/value/label stack, `figure` type token (tabular numerals) for the value.
 */
const StatTile = React.forwardRef<HTMLDivElement, StatTileProps>(
  ({ className, icon, value, label, trend, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="stat-tile"
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-xs bg-recessed border border-divider/10 px-4 py-4 text-center transition-colors',
        className,
      )}
      {...props}
    >
      {icon ? <div className="text-text-mid">{icon}</div> : null}
      <div className="flex items-center gap-1.5">
        <span className="tabular-nums text-[20px] leading-[1.15] font-extrabold text-text-hi">
          {value}
        </span>
        {trend ? (
          <span
            className={cn(
              'text-xs font-bold',
              trend === 'up' ? 'text-success-text' : 'text-error-text',
            )}
            aria-hidden="true"
          >
            {trend === 'up' ? '▲' : '▼'}
          </span>
        ) : null}
      </div>
      <span className="text-[9px] leading-[1.3] font-bold tracking-[0.05em] text-text-low uppercase">
        {label}
      </span>
    </div>
  ),
)
StatTile.displayName = 'StatTile'

export { StatTile }
