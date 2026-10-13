import { Check } from 'lucide-react'
import { useState } from 'react'
import { AVATAR_COLOURS, AVATAR_ICONS, avatarColour } from '../../design/avatar'
import { formatDate } from '../../domain/dates'
import { useIsDark } from '../../hooks/useIsDark'
import { useSettings } from '../../state/SettingsProvider'
import type { Settings } from '../../state/settings'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { Avatar, ICONS, iconFor } from './Avatar'

export function ProfileHeader() {
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)
  const name = settings.displayName?.trim() || 'You'
  const colour = avatarColour(settings.avatarColour)

  return (
    <header className="flex items-center gap-4">
      <button type="button" aria-label="Change avatar" onClick={() => setOpen(true)} className="rounded-full">
        <Avatar
          icon={settings.avatarIcon} colour={settings.avatarColour} size={80}
          label={`Avatar: ${iconFor(settings.avatarIcon).label.toLowerCase()} on ${colour.label.toLowerCase()}`}
        />
      </button>
      <div className="min-w-0">
        <h1 className="truncate font-display text-xl font-semibold">{name}</h1>
        {settings.onboardedAt ? (
          <p className="text-slate">Tracking since {formatDate(settings.onboardedAt.slice(0, 10), settings.dateFormat)}</p>
        ) : null}
      </div>

      <AvatarSheet open={open} onClose={() => setOpen(false)} />
    </header>
  )
}

/** Choose an avatar icon and colour. Each choice saves at once, with Undo. */
export function AvatarSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, update } = useSettings()
  const toast = useToast()
  const dark = useIsDark()
  const colour = avatarColour(settings.avatarColour)

  async function choose(patch: Partial<Pick<Settings, 'avatarIcon' | 'avatarColour'>>) {
    const before = { avatarIcon: settings.avatarIcon, avatarColour: settings.avatarColour }
    await update(patch)
    toast.show('Avatar updated', { undo: () => update(before) })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Your avatar">
      <div className="flex flex-col gap-6">
        <div className="flex justify-center">
          <Avatar icon={settings.avatarIcon} colour={settings.avatarColour} size={96} />
        </div>
        <fieldset>
          <legend className="mb-2 font-semibold">Icon</legend>
          <div role="radiogroup" aria-label="Icon" className="grid grid-cols-4 gap-2">
            {AVATAR_ICONS.map((key) => {
              const { Icon, label } = ICONS[key]
              const selected = settings.avatarIcon === key
              return (
                <button
                  key={key} type="button" role="radio" aria-checked={selected} aria-label={label}
                  onClick={() => !selected && void choose({ avatarIcon: key })}
                  className={`flex min-h-14 items-center justify-center rounded-xl border ${selected ? 'border-2 border-pond text-pond' : 'border-fog text-ink'}`}
                >
                  <Icon aria-hidden="true" size={24} />
                </button>
              )
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 font-semibold">Colour</legend>
          <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-3">
            {AVATAR_COLOURS.map((c) => {
              const selected = c.key === colour.key
              const pair = dark ? c.dark : c.light
              return (
                <button
                  key={c.key} type="button" role="radio" aria-checked={selected} aria-label={c.label}
                  onClick={() => !selected && void choose({ avatarColour: c.key })}
                  className={`flex size-12 items-center justify-center rounded-full ring-offset-2 ring-offset-surface ${selected ? 'ring-2 ring-pond' : 'ring-1 ring-fog'}`}
                  style={{ background: pair.bg, color: pair.fg }}
                >
                  {selected ? <Check aria-hidden="true" size={20} /> : null}
                </button>
              )
            })}
          </div>
        </fieldset>
      </div>
    </Sheet>
  )
}
