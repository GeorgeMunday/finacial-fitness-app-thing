import { useRef, useState, type ButtonHTMLAttributes, type MouseEvent } from 'react'

const VARIANT = {
  primary: 'bg-pond text-on-pond font-semibold',
  secondary: 'bg-surface text-ink border border-fog',
  quiet: 'bg-transparent text-pond',
  danger: 'bg-transparent text-danger border border-danger',
} as const

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  variant?: keyof typeof VARIANT
  /** If this returns a promise, the button ignores further taps until it settles, so a double tap can't save twice. */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => unknown
}

export function Button({ variant = 'primary', className = '', type = 'button', onClick, disabled, ...rest }: Props) {
  const running = useRef(false) // blocks a second tap in the same tick, before React re-renders
  const [busy, setBusy] = useState(false)
  return (
    <button
      type={type}
      className={`min-h-11 min-w-11 rounded-xl px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={(e) => {
        if (running.current || !onClick) return
        const result = onClick(e)
        if (!(result instanceof Promise)) return
        running.current = true
        setBusy(true)
        result
          .catch((err: unknown) => console.error(err))
          .finally(() => {
            running.current = false
            setBusy(false)
          })
      }}
      {...rest}
    />
  )
}
