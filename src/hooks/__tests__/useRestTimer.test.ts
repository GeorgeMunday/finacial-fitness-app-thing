import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRestTimer } from '../useRestTimer'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useRestTimer', () => {
  it('counts down, extends and stops at zero', () => {
    const { result } = renderHook(() => useRestTimer())
    act(() => result.current.start())
    expect(result.current.remaining).toBe(90)
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(result.current.remaining).toBe(60)
    act(() => result.current.add(30))
    expect(result.current.remaining).toBe(90)
    act(() => { vi.advanceTimersByTime(91_000) })
    expect(result.current.remaining).toBe(0)
    expect(result.current.running).toBe(false)
  })
  it('stays correct after the tab was backgrounded', () => {
    const { result } = renderHook(() => useRestTimer(90))
    act(() => result.current.start())
    vi.setSystemTime(Date.now() + 60_000)
    act(() => { vi.advanceTimersByTime(250) })
    expect(result.current.remaining).toBe(30)
  })
  it('stop resets', () => {
    const { result } = renderHook(() => useRestTimer(90))
    act(() => result.current.start())
    act(() => result.current.stop())
    expect(result.current.running).toBe(false)
  })
})
