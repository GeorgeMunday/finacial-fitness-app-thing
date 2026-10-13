import { NavLink } from 'react-router-dom'
import { useSettings } from '../state/SettingsProvider'

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center px-1 text-sm ${isActive ? 'font-semibold text-pond' : 'text-slate'}`

export function BottomNav({ onAdd }: { onAdd: () => void }) {
  const { settings } = useSettings()
  const food = settings.optionalPillars.includes('food')
  const train = settings.optionalPillars.includes('train')
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-fog bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex h-16 max-w-lg items-center">
        <NavLink to="/" end className={linkCls}>Today</NavLink>
        <NavLink to="/money" className={linkCls}>Money</NavLink>
        <button
          aria-label="Add"
          onClick={onAdd}
          className="mx-1 min-h-11 min-w-20 rounded-full bg-pond px-6 py-2 text-xl font-semibold text-on-pond"
        >
          +
        </button>
        {food ? <NavLink to="/food" className={linkCls}>Food</NavLink> : null}
        {train ? <NavLink to="/train" className={linkCls}>Train</NavLink> : null}
        <NavLink to="/more" className={linkCls}>More</NavLink>
      </div>
    </nav>
  )
}
