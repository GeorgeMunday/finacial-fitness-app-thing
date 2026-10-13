import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBarcodeScanner } from '../useBarcodeScanner'

const setMedia = (getUserMedia: unknown) =>
  Object.defineProperty(navigator, 'mediaDevices', { value: getUserMedia ? { getUserMedia } : undefined, configurable: true })

afterEach(() => setMedia(undefined))

const videoRef = () => {
  const v = document.createElement('video')
  v.play = vi.fn(async () => {})
  return { current: v }
}

describe('useBarcodeScanner', () => {
  it('is unsupported without getUserMedia', async () => {
    setMedia(undefined)
    const { result } = renderHook(() => useBarcodeScanner(videoRef(), vi.fn()))
    await act(() => result.current.start())
    expect(result.current.status).toBe('unsupported')
  })
  it('reports denied on NotAllowedError', async () => {
    setMedia(vi.fn(async () => { throw new DOMException('no', 'NotAllowedError') }))
    const { result } = renderHook(() => useBarcodeScanner(videoRef(), vi.fn()))
    await act(() => result.current.start())
    expect(result.current.status).toBe('denied')
  })
  it('calls onCode once and stops the camera', async () => {
    const stop = vi.fn()
    setMedia(vi.fn(async () => ({ getTracks: () => [{ stop }] })))
    const onCode = vi.fn()
    const detect = vi.fn(async () => [{ rawValue: '5000159484695' }])
    const { result } = renderHook(() => useBarcodeScanner(videoRef(), onCode, { createDetector: async () => ({ detect }) }))
    await act(() => result.current.start())
    await waitFor(() => expect(onCode).toHaveBeenCalledTimes(1))
    expect(onCode).toHaveBeenCalledWith('5000159484695')
    expect(stop).toHaveBeenCalled()
    await new Promise((r) => setTimeout(r, 400))
    expect(onCode).toHaveBeenCalledTimes(1)
  })
})
