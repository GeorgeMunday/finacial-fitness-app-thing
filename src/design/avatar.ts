/** Avatar background/icon pairs built from the design tokens; each pair passes 4.5:1 in its theme. No red. */
export type AvatarColour = { key: string; label: string; light: { bg: string; fg: string }; dark: { bg: string; fg: string } }

export const AVATAR_COLOURS: AvatarColour[] = [
  { key: 'pond', label: 'Pond', light: { bg: '#0F6E6A', fg: '#FFFFFF' }, dark: { bg: '#3FB8AE', fg: '#0F1A1D' } },
  { key: 'marigold', label: 'Marigold', light: { bg: '#E9A23B', fg: '#1B2A2F' }, dark: { bg: '#F0B85A', fg: '#0F1A1D' } },
  { key: 'ink', label: 'Ink', light: { bg: '#1B2A2F', fg: '#F2F5F3' }, dark: { bg: '#E6EEEC', fg: '#0F1A1D' } },
  { key: 'fog', label: 'Fog', light: { bg: '#D5DDDA', fg: '#1B2A2F' }, dark: { bg: '#2A3A3E', fg: '#E6EEEC' } },
  { key: 'slate', label: 'Slate', light: { bg: '#5C6B70', fg: '#FFFFFF' }, dark: { bg: '#9DB0B4', fg: '#0F1A1D' } },
]

export const avatarColour = (key: string | undefined): AvatarColour => AVATAR_COLOURS.find((c) => c.key === key) ?? AVATAR_COLOURS[0]

export const AVATAR_ICONS = [
  'user', 'wallet', 'piggy-bank', 'coins', 'dumbbell', 'apple', 'bike', 'coffee',
  'leaf', 'sprout', 'star', 'sun', 'moon', 'mountain', 'footprints', 'music',
] as const
export type AvatarIcon = (typeof AVATAR_ICONS)[number]
