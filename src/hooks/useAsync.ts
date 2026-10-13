import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'

/** Runs a local DB read and re-runs it on `reload()`. No loading UI: the database is local. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): { data: T | undefined; reload: () => void } {
  const [data, setData] = useState<T>()
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    let live = true
    void fnRef.current().then((d) => live && setData(d))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, reload }
}
