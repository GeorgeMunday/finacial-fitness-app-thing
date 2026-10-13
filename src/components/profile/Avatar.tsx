import {
  Apple, Bike, Coffee, Coins, Dumbbell, Footprints, Leaf, Moon, Mountain, Music, PiggyBank, Sprout, Star, Sun, User, Wallet,
  type LucideIcon,
} from 'lucide-react'
import { avatarColour, type AvatarIcon } from '../../design/avatar'
import { useIsDark } from '../../hooks/useIsDark'

export const ICONS: Record<AvatarIcon, { Icon: LucideIcon; label: string }> = {
  user: { Icon: User, label: 'Person' },
  wallet: { Icon: Wallet, label: 'Wallet' },
  'piggy-bank': { Icon: PiggyBank, label: 'Piggy bank' },
  coins: { Icon: Coins, label: 'Coins' },
  dumbbell: { Icon: Dumbbell, label: 'Dumbbell' },
  apple: { Icon: Apple, label: 'Apple' },
  bike: { Icon: Bike, label: 'Bike' },
  coffee: { Icon: Coffee, label: 'Coffee' },
  leaf: { Icon: Leaf, label: 'Leaf' },
  sprout: { Icon: Sprout, label: 'Sprout' },
  star: { Icon: Star, label: 'Star' },
  sun: { Icon: Sun, label: 'Sun' },
  moon: { Icon: Moon, label: 'Moon' },
  mountain: { Icon: Mountain, label: 'Mountain' },
  footprints: { Icon: Footprints, label: 'Footprints' },
  music: { Icon: Music, label: 'Music' },
}

export const iconFor = (key: string | undefined) => ICONS[key as AvatarIcon] ?? ICONS.user

/** A circle in the chosen colour with the chosen icon. Decorative unless given a label. */
export function Avatar({ icon, colour, size = 72, label }: { icon?: string; colour?: string; size?: number; label?: string }) {
  const dark = useIsDark()
  const c = avatarColour(colour)
  const { Icon } = iconFor(icon)
  const pair = dark ? c.dark : c.light
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: pair.bg, color: pair.fg }}
    >
      <Icon aria-hidden="true" size={Math.round(size * 0.48)} strokeWidth={2} />
    </span>
  )
}
