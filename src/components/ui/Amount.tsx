import { formatPence } from '../../domain/money'

const SIZE = { hero: 'text-4xl', title: 'text-xl', body: 'text-base' } as const

export function Amount({ pence, size = 'body', className = '' }: { pence: number; size?: keyof typeof SIZE; className?: string }) {
  const text = formatPence(pence)
  return (
    <span aria-label={text} className={`font-display font-semibold tabular ${SIZE[size]} ${className}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {text}
    </span>
  )
}
