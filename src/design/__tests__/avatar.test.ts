import { describe, expect, it } from 'vitest'
import { AVATAR_COLOURS, AVATAR_ICONS, avatarColour } from '../avatar'
import { contrastRatio } from '../contrast'

describe('avatar options', () => {
  it('offers about 16 icons and 4–6 colours', () => {
    expect(AVATAR_ICONS.length).toBeGreaterThanOrEqual(14)
    expect(AVATAR_ICONS.length).toBeLessThanOrEqual(18)
    expect(AVATAR_COLOURS.length).toBeGreaterThanOrEqual(4)
    expect(AVATAR_COLOURS.length).toBeLessThanOrEqual(6)
  })
  it.each(['light', 'dark'] as const)('every swatch keeps its icon readable in %s mode (≥ 4.5:1)', (theme) => {
    for (const c of AVATAR_COLOURS) expect(contrastRatio(c[theme].bg, c[theme].fg), c.key).toBeGreaterThanOrEqual(4.5)
  })
  it('never uses red', () => {
    for (const c of AVATAR_COLOURS) for (const t of ['light', 'dark'] as const) expect(c[t].bg.toUpperCase()).not.toMatch(/^#(A3261E|F2867D)$/)
  })
  it('falls back to the first colour for an unknown key', () => {
    expect(avatarColour('nope').key).toBe(AVATAR_COLOURS[0].key)
  })
})
