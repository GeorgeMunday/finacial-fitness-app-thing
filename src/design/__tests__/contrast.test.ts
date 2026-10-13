import { describe, expect, it } from 'vitest'
import { TOKENS, contrastRatio } from '../contrast'

describe('contrastRatio', () => {
  it('black on white is 21', () => expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 0))
})

describe.each(['light', 'dark'] as const)('%s theme', (theme) => {
  const t = TOKENS[theme]
  it.each([
    ['ink', 'chalk'], ['ink', 'surface'], ['slate', 'chalk'], ['slate', 'surface'], ['onPond', 'pond'],
    ['onMarigold', 'marigold'], ['amberInk', 'chalk'], ['amberInk', 'surface'], ['pond', 'chalk'], ['danger', 'surface'],
  ] as const)('%s on %s ≥ 4.5', (fg, bg) => {
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5)
  })
  it('fog divides chalk (≥1.2)', () => {
    expect(contrastRatio(t.fog, t.chalk)).toBeGreaterThanOrEqual(1.2)
  })
})
