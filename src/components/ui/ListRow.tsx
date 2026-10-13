import type { HTMLAttributes, ReactNode } from 'react'

export function ListRow({ title, detail, trailing, className = '', ...rest }: { title: ReactNode; detail?: ReactNode; trailing?: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <div className={`flex min-h-16 items-center gap-3 border-b border-fog py-3 ${className}`} {...rest}>
      <div className="min-w-0 flex-1">
        <div className="truncate">{title}</div>
        {detail ? <div className="mt-0.5 text-sm text-slate">{detail}</div> : null}
      </div>
      {trailing}
    </div>
  )
}
