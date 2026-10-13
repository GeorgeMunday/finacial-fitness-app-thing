import { useParams } from 'react-router-dom'
import { ListRow } from '../../components/ui/ListRow'
import { useAsync } from '../../hooks/useAsync'
import { fromKg } from '../../domain/units'
import { exerciseHistory, getExercise, personalRecords } from '../../domain/training'
import { useDb } from '../../state/DbProvider'
import { useSettings } from '../../state/SettingsProvider'

export default function Exercise() {
  const { id = '' } = useParams()
  const db = useDb()
  const unit = useSettings().settings.weightUnit
  const { data } = useAsync(async () => ({ ex: await getExercise(db, id), pr: await personalRecords(db, id), history: await exerciseHistory(db, id) }), [db, id])
  if (!data) return null
  if (!data.ex) return <p>That exercise couldn't be found.</p>
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-semibold">{data.ex.name}</h1>
      <div className="flex gap-6">
        <div><p className="font-display text-2xl font-semibold">{fromKg(data.pr.heaviestKg, unit)} {unit}</p><p className="text-sm text-slate">Heaviest</p></div>
        <div><p className="font-display text-2xl font-semibold">{fromKg(data.pr.bestEst1rmKg, unit)} {unit}</p><p className="text-sm text-slate">Estimated 1 rep max</p></div>
      </div>
      <section aria-label="History">
        {data.history.length === 0 ? <p className="text-slate">No sets logged yet.</p> : null}
        {data.history.map((h, i) => <ListRow key={i} title={`${fromKg(h.weight_kg, unit)} ${unit} × ${h.reps}`} detail={h.log_date} />)}
      </section>
    </div>
  )
}
