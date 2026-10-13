import { useNavigate } from 'react-router-dom'
import { useSettings } from '../state/SettingsProvider'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'

export function QuickLogSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings } = useSettings()
  const navigate = useNavigate()
  const go = (to: string) => {
    onClose()
    navigate(to)
  }
  return (
    <Sheet open={open} onClose={onClose} title="Quick log">
      <div className="flex flex-col gap-2">
        <Button className="min-h-16 text-xl" onClick={() => go('/money/add?kind=expense')}>Add expense</Button>
        <Button variant="secondary" onClick={() => go('/money/add?kind=income')}>Add income</Button>
        <Button variant="secondary" onClick={() => go('/money/goals')}>Save to a goal</Button>
        {settings.optionalPillars.includes('food') ? (
          <Button variant="secondary" onClick={() => go('/food/search')}>Log food</Button>
        ) : null}
        {settings.optionalPillars.includes('train') ? (
          <Button variant="secondary" onClick={() => go('/train')}>Log set</Button>
        ) : null}
      </div>
    </Sheet>
  )
}
