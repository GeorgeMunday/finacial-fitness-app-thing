import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner'
import { lookupBarcode } from '../../domain/openFoodFacts'
import { useDb } from '../../state/DbProvider'
import { logDateParam, withDate } from './slots'

export default function Scan() {
  const db = useDb()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const slot = params.get('slot') ?? ''
  const date = logDateParam(params)
  const video = useRef<HTMLVideoElement>(null)
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handle(raw: string) {
    const code = raw.trim()
    setBusy(code)
    setError(null)
    let r: Awaited<ReturnType<typeof lookupBarcode>>
    try {
      r = await lookupBarcode(db, code)
    } catch {
      setError("Couldn't look that barcode up. Try again, or create the food yourself.")
      return
    } finally {
      setBusy(null)
    }
    if (r.status === 'found') return navigate(withDate(`/food/${r.food.id}`, date, { slot }), { replace: true })
    const q: Record<string, string> = { barcode: r.draft.barcode, slot }
    if (r.status === 'incomplete') {
      const d = r.draft
      if (d.name) q.name = d.name
      if (d.brand) q.brand = d.brand
      if (d.kcal100g !== undefined) q.kcal = String(d.kcal100g)
      if (d.protein100g !== undefined) q.protein = String(d.protein100g)
      if (d.carbs100g !== undefined) q.carbs = String(d.carbs100g)
      if (d.fat100g !== undefined) q.fat = String(d.fat100g)
      if (d.servingG) q.serving = String(d.servingG)
      if (d.fibre100g != null) q.fibre = String(d.fibre100g)
      if (d.sugars100g != null) q.sugars = String(d.sugars100g)
      if (d.salt100g != null) q.salt = String(d.salt100g)
    }
    navigate(withDate('/food/new', date, q), { replace: true })
  }

  const scanner = useBarcodeScanner(video, (c) => void handle(c))
  const camera = !busy && (scanner.status === 'starting' || scanner.status === 'scanning')
  const validManual = /^\d{8,14}$/.test(manual.trim())
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-semibold">Scan barcode</h1>
      <video ref={video} playsInline muted className={camera ? 'aspect-[4/3] w-full rounded-xl bg-ink object-cover' : 'hidden'} />
      {scanner.status === 'idle' ? <Button onClick={() => void scanner.start()}>Start camera</Button> : null}
      {scanner.status === 'denied' ? <p>Camera access is off. Type the barcode instead, or allow the camera in your browser settings.</p> : null}
      {scanner.status === 'unsupported' ? <p>This browser can't scan barcodes. Type the barcode instead.</p> : null}
      <label className="flex flex-col gap-1">
        Barcode
        <input className="min-h-11 rounded-xl border border-fog bg-surface px-3" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} />
      </label>
      <Button variant="secondary" disabled={!validManual || busy !== null} onClick={() => void handle(manual)}>Look up</Button>
      {busy ? <p role="status">Looking up {busy}…</p> : null}
      {error ? <p className="text-amber-ink">{error}</p> : null}
      <p className="text-sm text-slate">Looking up a barcode asks Open Food Facts. Nothing else leaves your device.</p>
    </div>
  )
}
