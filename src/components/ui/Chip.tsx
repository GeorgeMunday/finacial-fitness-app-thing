import type { ButtonHTMLAttributes } from 'react'

export function Chip({ selected = false, className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={`min-h-11 rounded-full px-4 border ${selected ? 'bg-pond text-on-pond border-pond' : 'bg-surface text-ink border-fog'} ${className}`}
      {...rest}
    />
  )
}
