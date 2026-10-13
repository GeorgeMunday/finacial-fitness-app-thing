export async function requestPersistence(storage: StorageManager | undefined = globalThis.navigator?.storage): Promise<boolean | null> {
  if (!storage?.persist) return null
  try {
    return await storage.persist()
  } catch {
    return null
  }
}

export function isStandalone(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean }
  return win.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
}

export function isIos(win: Window = window): boolean {
  return /iPad|iPhone|iPod/.test(win.navigator.userAgent) || (win.navigator.platform === 'MacIntel' && win.navigator.maxTouchPoints > 1)
}
