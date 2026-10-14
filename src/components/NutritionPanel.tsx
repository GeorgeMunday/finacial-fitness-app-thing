export type PanelNutrition = {
  kcal: number; proteinG: number; carbsG: number; fatG: number
  fibreG: number | null; sugarsG: number | null; saltG: number | null
}

type Split = { protein: number; carbs: number; fat: number }

/** Share of energy from protein, carbs and fat (4/4/9 kcal per g) as whole percentages that add to 100. */
export function energySplit(proteinG: number, carbsG: number, fatG: number): Split | null {
  const e = { protein: proteinG * 4, carbs: carbsG * 4, fat: fatG * 9 }
  const total = e.protein + e.carbs + e.fat
  if (!(total > 0)) return null
  const keys = ['protein', 'carbs', 'fat'] as const
  const raw = keys.map((k) => (e[k] / total) * 100)
  const out = raw.map(Math.floor)
  // Largest remainder, so the three always add to exactly 100.
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0])
  const short = 100 - out.reduce((a, b) => a + b, 0)
  for (let i = 0; i < short; i++) out[order[i][1]]++
  return { protein: out[0], carbs: out[1], fat: out[2] }
}

const SEGMENTS = [
  { key: 'protein', label: 'Protein', colour: 'var(--macro-protein)' },
  { key: 'carbs', label: 'Carbs', colour: 'var(--macro-carbs)' },
  { key: 'fat', label: 'Fat', colour: 'var(--macro-fat)' },
] as const

const g = (v: number | null) => (v === null ? 'Not known' : `${v} g`)

/** The energy split of a portion as one stacked bar (each segment labelled in text), then its nutrients as a table. */
export function NutritionPanel({ n, hideCalories, table = true }: { n: PanelNutrition; hideCalories: boolean; table?: boolean }) {
  const split = energySplit(n.proteinG, n.carbsG, n.fatG)
  const rows: [string, string, boolean?][] = [
    ...(hideCalories ? [] : [['Calories', `${n.kcal} kcal`] as [string, string]]),
    ['Protein', g(n.proteinG)],
    ['Carbs', g(n.carbsG)],
    ['of which sugars', g(n.sugarsG), true],
    ['Fat', g(n.fatG)],
    ['Fibre', g(n.fibreG)],
    ['Salt', g(n.saltG)],
  ]
  return (
    <div className="flex flex-col gap-3">
      {split ? (
        <div className="flex flex-col gap-2">
          <div
            role="img"
            aria-label={`Energy from protein ${split.protein}%, carbs ${split.carbs}%, fat ${split.fat}%`}
            className="flex h-3 w-full gap-[2px]"
          >
            {SEGMENTS.filter((s) => split[s.key] > 0).map((s) => (
              <div key={s.key} title={`${s.label} ${split[s.key]}%`} className="h-full rounded-[4px]" style={{ width: `${split[s.key]}%`, background: s.colour }} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-hidden="true">
            {SEGMENTS.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full" style={{ background: s.colour }} />
                <span>{`${s.label} ${split[s.key]}%`}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {table ? (
        <table className="w-full text-sm">
          <caption className="sr-only">Nutrition</caption>
          <tbody>
            {rows.map(([label, value, sub]) => (
              <tr key={label} className="border-b border-fog last:border-0">
                <th scope="row" className={`py-1.5 text-left font-normal ${sub ? 'pl-4 text-slate' : ''}`}>{label}</th>
                <td className={`py-1.5 text-right tabular ${value === 'Not known' ? 'text-slate' : ''}`}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}
