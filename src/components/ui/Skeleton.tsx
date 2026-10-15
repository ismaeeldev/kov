import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Base skeleton block — docs/04_ApplicationFlow.md §4 ("Loading (skeleton)").
 * Steel-blue-tinted shimmer (never generic gray), per docs/02_ThemeGuideline.md §9.
 * Composed into screen-specific skeletons via the primitives below.
 */
export interface SkeletonProps extends React.ComponentProps<'div'> {
  /** Number of repeated skeleton rows to render. Defaults to 1. */
  count?: number
  /** Gap between repeated rows, only used when count > 1. */
  rowGapClassName?: string
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, count = 1, rowGapClassName = 'gap-2', style, ...props }, ref) => {
    if (count === 1) {
      return (
        <div
          ref={ref}
          data-slot="skeleton"
          className={cn(
            'animate-pulse rounded-sm bg-gradient-to-r from-brand-900/20 via-brand-500/25 to-brand-900/20 bg-[length:200%_100%]',
            className,
          )}
          style={{ animation: 'kov-shimmer 1.4s linear infinite', ...style }}
          {...props}
        />
      )
    }
    return (
      <div className={cn('flex flex-col', rowGapClassName)}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            data-slot="skeleton"
            className={cn(
              'animate-pulse rounded-sm bg-gradient-to-r from-brand-900/20 via-brand-500/25 to-brand-900/20 bg-[length:200%_100%]',
              className,
            )}
            style={{ animation: 'kov-shimmer 1.4s linear infinite' }}
          />
        ))}
      </div>
    )
  },
)
Skeleton.displayName = 'Skeleton'

/**
 * List row skeleton primitive (§16.1) — shaped like real list items
 * (avatar/badge + title/subtitle + optional trailing action/figure).
 */
export interface SkeletonRowProps extends React.ComponentProps<'div'> {
  count?: number
  hasAvatar?: boolean
  avatarShape?: 'circle' | 'square'
  hasAction?: boolean
}

const SkeletonRow = React.forwardRef<HTMLDivElement, SkeletonRowProps>(
  (
    { className, count = 1, hasAvatar = true, avatarShape = 'circle', hasAction = false, ...props },
    ref,
  ) => {
    if (count > 1) {
      return (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: count }).map((_, i) => (
            <SkeletonRow
              key={i}
              className={className}
              hasAvatar={hasAvatar}
              avatarShape={avatarShape}
              hasAction={hasAction}
              {...props}
            />
          ))}
        </div>
      )
    }

    return (
      <div
        ref={ref}
        data-slot="skeleton-row"
        className={cn(
          'flex items-center gap-3 rounded-sm bg-surface p-4 shadow-raised',
          className,
        )}
        {...props}
      >
        {hasAvatar ? (
          <Skeleton
            className={cn(
              'h-10 w-10 shrink-0',
              avatarShape === 'circle' ? 'rounded-full' : 'rounded-xs',
            )}
          />
        ) : null}
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <Skeleton className="h-4 w-2/5 rounded-xs" />
          <Skeleton className="h-3 w-3/5 rounded-xs opacity-75" />
        </div>
        {hasAction ? <Skeleton className="h-8 w-16 shrink-0 rounded-xs" /> : null}
      </div>
    )
  },
)
SkeletonRow.displayName = 'SkeletonRow'

/**
 * Card skeleton primitive (§16.1) — container with header and content lines.
 */
export interface SkeletonCardProps extends React.ComponentProps<'div'> {
  lines?: number
}

const SkeletonCard = React.forwardRef<HTMLDivElement, SkeletonCardProps>(
  ({ className, lines = 3, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="skeleton-card"
      className={cn('flex flex-col gap-3.5 rounded-sm bg-surface p-4 sm:p-5 shadow-raised', className)}
      {...props}
    >
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-1/3 rounded-xs" />
        <Skeleton className="h-4 w-16 rounded-pill" />
      </div>
      <div className="flex flex-col gap-2 pt-1">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn('h-3.5 rounded-xs', i === lines - 1 ? 'w-2/3' : 'w-full')}
          />
        ))}
      </div>
    </div>
  ),
)
SkeletonCard.displayName = 'SkeletonCard'

/**
 * Stat tile skeleton primitive (§16.1) — recessed tile with value + label bars.
 */
const SkeletonStatTile = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="skeleton-stat-tile"
      className={cn(
        'flex flex-col items-center gap-2 rounded-xs bg-recessed px-4 py-4 text-center',
        className,
      )}
      {...props}
    >
      <Skeleton className="h-4 w-4 rounded-full opacity-60" />
      <Skeleton className="h-6 w-20 rounded-xs" />
      <Skeleton className="h-3 w-14 rounded-xs opacity-75" />
    </div>
  ),
)
SkeletonStatTile.displayName = 'SkeletonStatTile'

/**
 * Form field skeleton primitive (§16.1) — label bar + input field.
 */
export interface SkeletonFormFieldProps extends React.ComponentProps<'div'> {
  hasHelper?: boolean
}

const SkeletonFormField = React.forwardRef<HTMLDivElement, SkeletonFormFieldProps>(
  ({ className, hasHelper = false, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="skeleton-form-field"
      className={cn('flex flex-col gap-1.5', className)}
      {...props}
    >
      <Skeleton className="h-3 w-24 rounded-xs" />
      <Skeleton className="h-12 w-full rounded-sm" />
      {hasHelper ? <Skeleton className="h-2.5 w-36 rounded-xs opacity-60" /> : null}
    </div>
  ),
)
SkeletonFormField.displayName = 'SkeletonFormField'

export { Skeleton, SkeletonRow, SkeletonCard, SkeletonStatTile, SkeletonFormField }
