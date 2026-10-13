import type { ButtonHTMLAttributes } from 'react'

const VARIANT = {
  primary: 'bg-pond text-on-pond font-semibold',
  secondary: 'bg-surface text-ink border border-fog',
  quiet: 'bg-transparent text-pond',
  danger: 'bg-transparent text-danger border border-danger',
} as const

export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT }) {
  return (
    <button
      type={type}
      className={`min-h-11 min-w-11 rounded-xl px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  )
}
