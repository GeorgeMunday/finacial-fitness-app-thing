import { formatClock } from '../hooks/useRestTimer'

export function RestTimer({ remaining, running, onAdd, onStop }: { remaining: number; running: boolean; onAdd: () => void; onStop: () => void }) {
  if (!running) return null
  return (
    <div role="timer" aria-label="Rest timer" className="sticky top-2 z-20 flex items-center justify-between gap-3 rounded-xl bg-ink px-4 py-2 text-chalk shadow-lg">
      <span>Rest</span>
      <span className="font-display text-2xl tabular">{formatClock(remaining)}</span>
      <div className="flex gap-1">
        <button type="button" className="min-h-11 min-w-11 rounded-xl px-3 font-semibold text-chalk underline-offset-4 hover:underline" onClick={onAdd}>+30 s</button>
        <button type="button" className="min-h-11 min-w-11 rounded-xl px-3 font-semibold text-chalk underline-offset-4 hover:underline" onClick={onStop}>Skip</button>
      </div>
    </div>
  )
}
