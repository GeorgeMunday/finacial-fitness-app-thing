import { Link } from 'react-router-dom'
import { listProgrammes } from '../../domain/programmes/catalog'
import { useAsync } from '../../hooks/useAsync'
import { useDb } from '../../state/DbProvider'

export const daysLabel = (options: number[]) => `${options.join(' or ')} days a week`
export const levelLabel = (level: string) => level.charAt(0).toUpperCase() + level.slice(1)

export default function Programmes() {
  const db = useDb()
  const { data } = useAsync(() => listProgrammes(db), [db])
  if (!data) return null
  return (
    <div className="flex flex-col gap-4">
      <Link to="/train" className="flex min-h-11 items-center self-start text-pond">Back to Train</Link>
      <h1 className="font-display text-xl font-semibold">Choose a programme</h1>
      <p className="text-slate">Pick one and Tally suggests the weights each session and moves them up when you earn it.</p>
      <div>
        {data.map((p) => (
          <Link key={p.key} to={`/train/programmes/${p.key}`} className="flex flex-col gap-1 border-b border-fog py-4">
            <span className="font-semibold">{p.name}</span>
            <span className="text-sm text-slate">{daysLabel(p.daysPerWeekOptions)} · {levelLabel(p.level)}{p.author ? ` · Credit: ${p.author}` : ''}</span>
            <span className="line-clamp-2">{p.description}</span>
            <span className="text-sm text-slate">{p.days.map((d) => d.name).join(' · ')}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
