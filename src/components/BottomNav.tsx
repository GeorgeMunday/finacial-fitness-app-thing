import { Apple, Dumbbell, House, Plus, Wallet, type LucideIcon } from 'lucide-react'
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

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

export function BottomNav({ onAdd }: { onAdd: () => void }) {
  const { settings } = useSettings()
  const items: NavItem[] = [
    { to: '/', label: 'Today', icon: House, end: true },
    { to: '/money', label: 'Money', icon: Wallet },
    ...(settings.optionalPillars.includes('food') ? [{ to: '/food', label: 'Food', icon: Apple }] : []),
    ...(settings.optionalPillars.includes('train') ? [{ to: '/train', label: 'Train', icon: Dumbbell }] : []),
  ]
  // Add sits in the exact middle; the items split evenly around it and share each half's width.
  const half = Math.ceil(items.length / 2)
  const side = (list: NavItem[]) => (
    <div className="flex h-full items-center">
      {list.map((i) => <Item key={i.to} {...i} />)}
    </div>
  )
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-fog bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid h-16 max-w-lg grid-cols-[1fr_auto_1fr] items-center px-2">
        {side(items.slice(0, half))}
        <div className="flex w-20 justify-center">
          <button
            aria-label="Add"
            onClick={onAdd}
            className="flex size-14 -translate-y-3 items-center justify-center rounded-full bg-pond text-on-pond shadow-[0_4px_12px_rgba(15,110,106,0.35)]"
          >
            <Plus aria-hidden="true" size={28} strokeWidth={2.5} />
          </button>
        </div>
        {side(items.slice(half))}
      </div>
    </nav>
  )
}
