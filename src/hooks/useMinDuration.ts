import { useEffect, useRef, useState } from 'react'

/**
 * Keeps a "still loading" boolean true for at least `minMs` after it first
 * becomes true, even if the real underlying condition (`isLoading`) flips
 * back to false sooner — found via a UX pass (2026-10-03): on a fast
 * connection, every page's skeleton was driven purely by `data === null`,
 * so it could flip to real content within a single frame, making the
 * skeleton moment feel like a glitch/flash rather than a deliberate,
 * readable loading state. This never ADDS latency to a genuinely slow
 * load — it only ever holds the skeleton a little longer on fast ones.
 *
 * Usage: replace `if (data === null) return <Skeleton />` with
 * `if (useMinDuration(data === null)) return <Skeleton />`.
 *
 * Implementation note: this project's lint config (eslint-plugin-react-
 * hooks's `purity` and `set-state-in-effect` rules) forbids calling an
 * impure function (`Date.now()`) during render — including inside a
 * `useRef(...)` initializer argument, which is still evaluated on every
 * render even though only its first result is kept — and forbids an
 * unconditional `setState` call appearing directly in an effect body. Both
 * are satisfied here by: (1) initializing `becameTrueAt` to `null` and only
 * ever calling `Date.now()` inside the effect/timer callbacks, never during
 * render; (2) using a `pending` ref flag read at the top of the effect to
 * skip the `setHeld` call entirely whenever the value wouldn't actually
 * change (so the only `setHeld` calls that run are the ones serializing a
 * REAL transition, not a resend of the same value every effect run).
 */
export function useMinDuration(isLoading: boolean, minMs = 400): boolean {
  const [held, setHeld] = useState(isLoading)
  const becameTrueAt = useRef<number | null>(null)
  const heldRef = useRef(isLoading)

  useEffect(() => {
    if (isLoading) {
      becameTrueAt.current ??= Date.now()
      if (!heldRef.current) {
        heldRef.current = true
        setHeld(true)
      }
      return
    }
    if (becameTrueAt.current === null) {
      if (heldRef.current) {
        heldRef.current = false
        setHeld(false)
      }
      return
    }
    const elapsed = Date.now() - becameTrueAt.current
    const remaining = minMs - elapsed
    if (remaining <= 0) {
      becameTrueAt.current = null
      if (heldRef.current) {
        heldRef.current = false
        setHeld(false)
      }
      return
    }
    const timer = setTimeout(() => {
      becameTrueAt.current = null
      heldRef.current = false
      setHeld(false)
    }, remaining)
    return () => clearTimeout(timer)
  }, [isLoading, minMs])

  return held
}
