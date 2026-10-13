import { Apple, Dumbbell, Ellipsis, House, Plus, Wallet, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useSettings } from '../state/SettingsProvider'

function Item({ to, label, icon: Icon, end }: { to: string; label: string; icon: LucideIcon; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 text-xs ${isActive ? 'font-semibold text-pond' : 'text-slate'}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon aria-hidden="true" size={22} strokeWidth={isActive ? 2.4 : 1.8} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

export function BottomNav({ onAdd }: { onAdd: () => void }) {
  const { settings } = useSettings()
  const food = settings.optionalPillars.includes('food')
  const train = settings.optionalPillars.includes('train')
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-fog bg-surface pb-[env(safe-area-inset-bottom)]">
      {/* Three columns so the Add button sits at the exact centre whatever pillars are on. */}
      <div className="mx-auto grid h-16 max-w-lg grid-cols-[1fr_auto_1fr] items-center px-2">
        <div className="flex h-full items-center">
          <Item to="/" end label="Today" icon={House} />
          <Item to="/money" label="Money" icon={Wallet} />
        </div>
        <div className="flex w-20 justify-center">
          <button
            aria-label="Add"
            onClick={onAdd}
            className="flex size-14 -translate-y-3 items-center justify-center rounded-full bg-pond text-on-pond shadow-[0_4px_12px_rgba(15,110,106,0.35)]"
          >
            <Plus aria-hidden="true" size={28} strokeWidth={2.5} />
          </button>
        </div>
        <div className="flex h-full items-center">
          {food ? <Item to="/food" label="Food" icon={Apple} /> : null}
          {train ? <Item to="/train" label="Train" icon={Dumbbell} /> : null}
          <Item to="/more" label="More" icon={Ellipsis} />
        </div>
      </div>
    </nav>
  )
}
