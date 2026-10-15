import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMinDuration } from './useMinDuration'

describe('useMinDuration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays true for at least minMs even after isLoading flips to false immediately', () => {
    const { result, rerender } = renderHook(({ isLoading }) => useMinDuration(isLoading, 400), {
      initialProps: { isLoading: true },
    })
    expect(result.current).toBe(true)

    rerender({ isLoading: false })
    // Real condition already resolved, but the hold should keep it true.
    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(399)
    })
    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(result.current).toBe(false)
  })

  it('never reports true if isLoading was never true', () => {
    const { result } = renderHook(() => useMinDuration(false, 400))
    expect(result.current).toBe(false)
  })

  it('does not shorten a genuinely slow load — stays true as long as isLoading is true', () => {
    const { result, rerender } = renderHook(({ isLoading }) => useMinDuration(isLoading, 400), {
      initialProps: { isLoading: true },
    })

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current).toBe(true)

    rerender({ isLoading: false })
    // Already well past minMs, so it resolves immediately (no extra wait tacked on).
    expect(result.current).toBe(false)
  })

  it('re-arms correctly if isLoading flips true again after resolving', () => {
    const { result, rerender } = renderHook(({ isLoading }) => useMinDuration(isLoading, 400), {
      initialProps: { isLoading: true },
    })
    rerender({ isLoading: false })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe(false)

    rerender({ isLoading: true })
    expect(result.current).toBe(true)
    rerender({ isLoading: false })
    expect(result.current).toBe(true)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe(false)
  })
})
