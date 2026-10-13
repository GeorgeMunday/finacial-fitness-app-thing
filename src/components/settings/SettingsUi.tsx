import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** A settings sub-screen: a way back to More, then a title. */
export function SubScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <Link to="/more" aria-label="Back to More" className="-ml-2 flex min-h-11 items-center gap-1 self-start pr-2 text-pond">
        <ChevronLeft aria-hidden="true" size={20} /> More
      </Link>
      <h1 className="-mt-4 font-display text-xl font-semibold">{title}</h1>
      {children}
    </div>
  )
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <h2 className="pb-1 text-sm text-slate">{title}</h2>
      <div className="border-t border-fog">{children}</div>
    </section>
  )
}

/** A full-width list row that opens another screen, with its current value on the right. */
export function RowLink({ to, label, value }: { to: string; label: string; value?: string }) {
  return (
    <Link to={to} className="flex min-h-14 items-center gap-3 border-b border-fog py-3">
      <span className="flex-1">{label}</span>
      {value ? <span className="truncate text-right text-slate">{value}</span> : null}
      <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-slate" />
    </Link>
  )
}

/** Single choice as full-width rows with a tick, not chips: easy to hit and to read. */
export function ChoiceList<T extends string | number>({ label, options, value, onChange }: {
  label: string; options: { value: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="border-t border-fog">
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={String(o.value)} type="button" role="radio" aria-checked={selected} aria-label={o.label}
            onClick={() => !selected && onChange(o.value)}
            className="flex min-h-14 w-full items-center gap-3 border-b border-fog py-3 text-left"
          >
            <span className="flex-1">
              {o.label}
              {o.hint ? <span className="block text-sm text-slate">{o.hint}</span> : null}
            </span>
            {selected ? <Check aria-hidden="true" size={20} className="text-pond" /> : null}
          </button>
        )
      })}
    </div>
  )
}

/** An on/off row. */
export function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center gap-3 border-b border-fog py-3 text-left"
    >
      <span className="flex-1">
        {label}
        {hint ? <span className="block text-sm text-slate">{hint}</span> : null}
      </span>
      <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-pond' : 'bg-fog'}`}>
        <span className={`absolute top-1 size-5 rounded-full bg-surface shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  )
}
