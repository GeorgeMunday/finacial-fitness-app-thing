/** Single source for design tokens; mirrored into src/styles/tokens.css. */
export type TokenName =
  | 'chalk' | 'surface' | 'ink' | 'slate' | 'fog' | 'pond' | 'onPond' | 'marigold' | 'onMarigold' | 'amberInk' | 'danger'

export const TOKENS: { light: Record<TokenName, string>; dark: Record<TokenName, string> } = {
  light: {
    chalk: '#F2F5F3', surface: '#FFFFFF', ink: '#1B2A2F', slate: '#5C6B70', fog: '#D5DDDA',
    pond: '#0F6E6A', onPond: '#FFFFFF', marigold: '#E9A23B', onMarigold: '#1B2A2F', amberInk: '#7A4B00', danger: '#A3261E',
  },
  dark: {
    chalk: '#0F1A1D', surface: '#172427', ink: '#E6EEEC', slate: '#9DB0B4', fog: '#2A3A3E',
    pond: '#3FB8AE', onPond: '#0F1A1D', marigold: '#F0B85A', onMarigold: '#0F1A1D', amberInk: '#F5C77A', danger: '#F2867D',
  },
}

const channel = (v: number) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** WCAG 2.x contrast ratio between two #RRGGBB colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
