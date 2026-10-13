import { useEffect } from 'react'

type Sentinel = { release(): Promise<void> }

/** Keeps the screen on while `active`, where the Screen Wake Lock API exists. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }).wakeLock
    if (!active || !wl) return
    let sentinel: Sentinel | null = null
    let live = true
    const acquire = () =>
      wl.request('screen').then((s) => {
        if (live) sentinel = s
        else void s.release()
      }).catch(() => {})
    void acquire()
    const onVis = () => document.visibilityState === 'visible' && void acquire()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      live = false
      document.removeEventListener('visibilitychange', onVis)
      void sentinel?.release().catch(() => {})
    }
  }, [active])
}
