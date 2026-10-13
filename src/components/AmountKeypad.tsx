import { useState } from 'react'
import { parsePence } from '../domain/money'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']

export function AmountKeypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [touched, setTouched] = useState(false)
  const invalid = touched && value.trim() !== '' && parsePence(value) === null
  const press = (k: string) => {
    if (k === '⌫') return onChange(value.slice(0, -1))
    if (k === '.' && value.includes('.')) return
    if (/\.\d\d$/.test(value)) return
    onChange(k === '.' && value === '' ? '0.' : value + k)
  }
  const finePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate">Amount</span>
        <input
          aria-label="Amount" aria-invalid={invalid} inputMode="decimal" autoComplete="off" value={value} autoFocus={finePointer}
          onChange={(e) => onChange(e.target.value)} onBlur={() => setTouched(true)}
          className="min-h-14 rounded-xl border border-fog bg-surface px-3 font-display text-3xl tabular"
        />
      </label>
      {invalid ? <p className="text-amber-ink">That amount isn't valid. Use numbers like 4.50.</p> : null}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Keypad">
        {KEYS.map((k) => (
          <button
            key={k} type="button" aria-label={k === '⌫' ? 'Delete digit' : k} onClick={() => press(k)} onMouseDown={(e) => e.preventDefault()}
            className="min-h-14 rounded-xl border border-fog bg-surface font-display text-2xl"
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}
