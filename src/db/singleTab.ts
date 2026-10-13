/** Holds a Web Lock for the page's life (memoised, so React StrictMode's double effect can't lock itself out).
 * Resolves false if another tab already holds it. */
let acquired: Promise<boolean> | undefined

export function acquireSingleTab(): Promise<boolean> {
  acquired ??= request()
  return acquired
}

function request(): Promise<boolean> {
  if (!('locks' in navigator)) return Promise.resolve(true)
  return new Promise((resolve) => {
    navigator.locks.request('tally-db', { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false)
        return
      }
      resolve(true)
      return new Promise<never>(() => {}) // never release
    })
  })
}
