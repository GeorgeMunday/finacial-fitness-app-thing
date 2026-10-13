import { useState } from 'react'
import { Avatar } from '../../components/profile/Avatar'
import { AvatarSheet } from '../../components/profile/ProfileHeader'
import { SubScreen } from '../../components/settings/SettingsUi'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { useSettings } from '../../state/SettingsProvider'

export default function ProfileSettings() {
  const { settings, update } = useSettings()
  const toast = useToast()
  const [name, setName] = useState(settings.displayName ?? '')
  const [open, setOpen] = useState(false)
  const tooLong = name.trim().length > 40
  return (
    <SubScreen title="Profile">
      <label className="flex flex-col gap-1">
        Display name
        <input className="min-h-11 rounded-xl border border-fog bg-surface px-3" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" maxLength={60} />
      </label>
      <p className="-mt-4 text-sm text-slate">Optional. Leave it empty to show “You”. It stays on this device.</p>
      {tooLong ? <p className="text-amber-ink">Keep it to 40 characters or fewer.</p> : null}
      <Button
        className="self-start" disabled={tooLong}
        onClick={async () => {
          await update({ displayName: name.trim() || undefined })
          toast.show('Name saved')
        }}
      >
        Save name
      </Button>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-16 items-center gap-4 border-y border-fog py-3 text-left">
        <Avatar icon={settings.avatarIcon} colour={settings.avatarColour} size={48} />
        <span className="flex-1">Change avatar</span>
      </button>
      <AvatarSheet open={open} onClose={() => setOpen(false)} />
    </SubScreen>
  )
}
