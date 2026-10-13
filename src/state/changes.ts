const EVENT = 'tally:change'

/** Tells mounted screens their data may be stale (e.g. after Undo from a toast that outlived its screen). */
export function emitChange(): void {
  window.dispatchEvent(new Event(EVENT))
}

export function onChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}
