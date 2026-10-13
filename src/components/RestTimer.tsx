import { formatClock } from '../hooks/useRestTimer'
import { Button } from './ui/Button'

export function RestTimer({ remaining, running, onAdd, onStop }: { remaining: number; running: boolean; onAdd: () => void; onStop: () => void }) {
  if (!running) return null
  return (
    <div role="timer" aria-label="Rest timer" className="fixed inset-x-0 bottom-20 z-20 mx-auto flex max-w-lg items-center justify-between gap-3 rounded-xl bg-ink px-4 py-2 text-chalk">
      <span>Rest</span>
      <span className="font-display text-2xl tabular">{formatClock(remaining)}</span>
      <div className="flex gap-1">
        <Button variant="quiet" className="text-chalk" onClick={onAdd}>+30 s</Button>
        <Button variant="quiet" className="text-chalk" onClick={onStop}>Skip</Button>
      </div>
    </div>
  )
}
