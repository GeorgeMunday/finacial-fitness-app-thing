import { useState } from 'react'
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { Sheet } from '../ui/Sheet'

export type Shortfall = { liftKey: string; name: string; logged: number; prescribed: number }

/** Asks, per short lift, whether it counts as a missed session. Nothing is penalised unless the user says so. */
export function ShortfallSheet({ shortfalls, onSave }: { shortfalls: Shortfall[] | null; onSave: (decisions: Record<string, 'miss' | 'ignore'>) => unknown }) {
  const [decisions, setDecisions] = useState<Record<string, 'miss' | 'ignore'>>({})
  if (!shortfalls) return null
  return (
    <Sheet open onClose={() => void onSave({})} title="Short on sets">
      <div className="flex flex-col gap-4">
        {shortfalls.map((s) => {
          const miss = decisions[s.liftKey] === 'miss'
          return (
            <div key={s.liftKey} className="flex flex-col gap-2 border-b border-fog pb-3">
              <p>{`You did ${s.logged} of ${s.prescribed} sets of ${s.name}. Count this as a missed session?`}</p>
              <div className="flex gap-2">
                <Chip selected={miss} aria-label={`Count as a miss: ${s.name}`} onClick={() => setDecisions((d) => ({ ...d, [s.liftKey]: 'miss' }))}>Count as a miss</Chip>
                <Chip selected={!miss} aria-label={`Don't count: ${s.name}`} onClick={() => setDecisions((d) => ({ ...d, [s.liftKey]: 'ignore' }))}>Don't count</Chip>
              </div>
            </div>
          )
        })}
        <Button onClick={() => onSave(decisions)}>Save workout</Button>
      </div>
    </Sheet>
  )
}
