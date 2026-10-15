import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends Omit<React.ComponentProps<'input'>, 'ref'> {
  label?: React.ReactNode
  helperText?: React.ReactNode
  error?: React.ReactNode
  leftIcon?: React.ReactNode
  rightAdornment?: React.ReactNode
  /** Applied to the OUTER wrapper (label + input + helper-text stack), not the
   * `<input>` itself — needed for layout classes like `flex-1`/`w-full` passed
   * by a parent flex row. */
  wrapperClassName?: string
}

/**
 * Kōv text input — docs/02_ThemeGuideline.md §6.3: surface background, 1.5px
 * divider border → brand border on hover/focus, radius-sm, 16px font (prevents
 * iOS zoom-on-focus). Error state overrides border/helper-text to --rouge.
 * Explicitly implements all 5 interactive states: default, hover, focus-visible,
 * active/typing, and disabled.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      wrapperClassName,
      label,
      helperText,
      error,
      id,
      leftIcon,
      rightAdornment,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId()
    const inputId = id ?? generatedId
    const describedBy = error || helperText ? `${inputId}-description` : undefined

    return (
      <div className={cn('group flex flex-col gap-1.5', wrapperClassName)}>
        {label ? (
          <label
            htmlFor={inputId}
            className="text-[11px] leading-[1.4] font-bold tracking-[0.05em] text-text-mid uppercase transition-colors group-focus-within:text-brand-300"
          >
            {label}
          </label>
        ) : null}
        <div className="relative flex items-center w-full">
          {leftIcon ? (
            <div className="pointer-events-none absolute left-3.5 z-10 flex items-center justify-center text-text-low transition-colors duration-150 group-focus-within:text-brand-300">
              {leftIcon}
            </div>
          ) : null}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            className={cn(
              'w-full rounded-sm border-[1.5px] border-divider bg-surface px-4 py-3.5',
              'text-[16px] text-text-hi placeholder:text-text-low',
              'outline-none transition-all duration-150',
              leftIcon && 'pl-11',
              rightAdornment && 'pr-11',
              'hover:border-brand-500/40',
              'focus:border-brand-500',
              'focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg',
              error &&
                'border-error hover:border-error focus:border-error focus-visible:ring-error/45',
              'disabled:opacity-40 disabled:pointer-events-none disabled:bg-recessed',
              className,
            )}
            {...props}
          />
          {rightAdornment ? (
            <div className="absolute right-2.5 z-10 flex items-center justify-center">
              {rightAdornment}
            </div>
          ) : null}
        </div>
        {error ? (
          <p id={describedBy} className="text-[12px] leading-[1.45] font-medium text-error-text">
            {error}
          </p>
        ) : helperText ? (
          <p id={describedBy} className="text-[12px] leading-[1.45] font-medium text-text-low">
            {helperText}
          </p>
        ) : null}
      </div>
    )
  },
)
Input.displayName = 'Input'

/**
 * Money input — purchase-price/sale-price fields (quote editor). Always uses
 * tabular numerals, even while being typed into (docs/02_ThemeGuideline.md §6.3) —
 * never a plain text-input font for money fields.
 */
const MoneyInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <Input
      ref={ref}
      type="number"
      inputMode="decimal"
      step="0.01"
      className={cn('tabular-nums font-extrabold', className)}
      {...props}
    />
  ),
)
MoneyInput.displayName = 'MoneyInput'

export { Input, MoneyInput }
