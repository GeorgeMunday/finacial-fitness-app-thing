import { useNavigate } from 'react-router-dom'
import { localDate } from '../../domain/dates'
import { usePersistent } from '../../state/DbProvider'
import { useSettings } from '../../state/SettingsProvider'
import { backupDue } from '../../state/settings'
import { Avatar } from './Avatar'

/**
 * The way into the profile: the user's avatar in the top-right of Today. A small amber dot says something in
 * settings needs attention (a backup is due, or the browser can't save data), so those warnings aren't hidden.
 */
export function ProfileButton() {
  const { settings } = useSettings()
  const persistent = usePersistent()
  const navigate = useNavigate()
  const reasons = [
    ...(backupDue(settings, localDate()) ? ['backup due'] : []),
    ...(persistent ? [] : ["data can't be saved in this browser"]),
  ]
  const label = ['Your profile and settings', reasons.join(' and ')].filter(Boolean).join(', ')
  return (
    <button
      type="button" aria-label={label} onClick={() => navigate('/you')}
      // 44 px target around a 40 px avatar; the global 2 px focus ring follows the circle.
      className="relative -mr-0.5 flex size-11 shrink-0 items-center justify-center rounded-full"
    >
      <Avatar icon={settings.avatarIcon} colour={settings.avatarColour} size={40} />
      {reasons.length ? (
        <span data-attention-dot aria-hidden="true" className="absolute left-[30px] top-[2px] size-3 rounded-full bg-amber-ink ring-2 ring-chalk" />
      ) : null}
    </button>
  )
}
