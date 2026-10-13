import { describe, expect, it } from 'vitest'
import { isStandalone, requestPersistence } from '../storage'

describe('storage', () => {
  it('requestPersistence reports the result or null when unsupported', async () => {
    expect(await requestPersistence({ persist: async () => true } as StorageManager)).toBe(true)
    expect(await requestPersistence({ persist: async () => false } as StorageManager)).toBe(false)
    expect(await requestPersistence({} as StorageManager)).toBeNull()
    expect(await requestPersistence(undefined)).toBeNull()
  })
  it('isStandalone detects display-mode and iOS flag', () => {
    const win = (standalone: boolean, ios?: boolean) =>
      ({ matchMedia: () => ({ matches: standalone }), navigator: { standalone: ios } }) as unknown as Window
    expect(isStandalone(win(true))).toBe(true)
    expect(isStandalone(win(false, true))).toBe(true)
    expect(isStandalone(win(false))).toBe(false)
  })
})
