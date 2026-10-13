import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function TodayCard({ title, to, children }: { title: string; to?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2 border-t border-fog pt-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">{title}</h2>
        {to ? <Link to={to} className="flex min-h-11 items-center px-2 text-pond">Open</Link> : null}
      </div>
      {children}
    </section>
  )
}
