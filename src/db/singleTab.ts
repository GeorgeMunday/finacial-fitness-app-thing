/** Holds a Web Lock for the page's life. Resolves false if another tab already holds it. */
export function acquireSingleTab(): Promise<boolean> {
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
