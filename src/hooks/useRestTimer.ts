import { useCallback, useEffect, useState } from 'react'

/** Rest timer keyed to an end timestamp, so it stays right after the tab was in the background. */
export function useRestTimer(defaultSeconds = 90) {
  const [endAt, setEndAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const running = endAt !== null && endAt > now
  const remaining = endAt === null ? 0 : Math.max(0, Math.ceil((endAt - now) / 1000))

  useEffect(() => {
    if (endAt === null) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= endAt) {
        setEndAt(null)
        clearInterval(id)
      }
    }, 250)
    return () => clearInterval(id)
  }, [endAt])

  const start = useCallback(() => {
    const t = Date.now()
    setNow(t)
    setEndAt(t + defaultSeconds * 1000)
  }, [defaultSeconds])
  const stop = useCallback(() => setEndAt(null), [])
  const add = useCallback((seconds: number) => {
    const t = Date.now()
    setNow(t)
    setEndAt((e) => (e === null || e < t ? t : e) + seconds * 1000)
  }, [])
  return { remaining, running, start, stop, add }
}

export const formatClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
